import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { createDb } from "./db/client";
import { kgTriples } from "./db/schema";
import { embedMany } from "./embeddings";
import { newTripleId } from "./ids";
import type { Bindings, KgTripleRow } from "./types";

// Knowledge-graph triple extraction via a small Workers AI LLM. Output
// is grounded in the source memory so we always cite an origin.

export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You extract knowledge-graph triples from a single short
piece of user-provided text. Return STRICT JSON with shape:
{"triples":[{"subject":"…","predicate":"…","object":"…","confidence":0.0-1.0}]}
Rules:
- Only use facts explicitly stated. No inference, no world knowledge.
- Subject and object must be concrete entities (people, projects,
  organizations, products, dates, attributes). Lowercase noun phrases.
- Predicate is a short snake_case verb phrase (e.g. prefers, works_at,
  has_role, located_in, scheduled_for).
- If nothing extractable, return {"triples":[]}.
Output ONLY the JSON object.`;

interface LlamaResponse {
  response?: string;
  result?: string;
}

export async function extractTriples(env: Bindings, text: string): Promise<Triple[]> {
  if (!text.trim()) return [];

  let raw: string;
  try {
    const out = (await env.AI.run(env.KG_LLM_MODEL as never, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      max_tokens: 512,
      temperature: 0,
    } as never)) as unknown as LlamaResponse;
    raw = (out.response ?? out.result ?? "").trim();
  } catch (err) {
    console.warn("kg_extract_failed", err);
    return [];
  }

  // The model occasionally wraps JSON in ``` fences. Strip generously.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { triples?: Triple[] };
    if (!Array.isArray(parsed.triples)) return [];
    return parsed.triples
      .filter(
        (t) =>
          t &&
          t.subject &&
          t.predicate &&
          t.object &&
          // Require an explicit numeric confidence — the model does
          // emit one on success. Without it we cannot rank, so drop
          // the row to keep graph scoring honest.
          typeof t.confidence === "number" &&
          Number.isFinite(t.confidence),
      )
      .map((t) => ({
        subject: String(t.subject).slice(0, 256),
        predicate: String(t.predicate).slice(0, 128),
        object: String(t.object).slice(0, 512),
        confidence: Math.max(0, Math.min(1, t.confidence)),
      }));
  } catch (err) {
    console.warn("kg_parse_failed", err);
    return [];
  }
}

export interface StoreTriplesArgs {
  env: Bindings;
  agentId: string;
  ownerId: string;
  pid: string;
  tid: string | null;
  sourceMemoryId: string;
  triples: Triple[];
}

export async function storeTriples(args: StoreTriplesArgs): Promise<KgTripleRow[]> {
  const { env, agentId, ownerId, pid, tid, sourceMemoryId, triples } = args;
  if (triples.length === 0) return [];

  const db = createDb(env.DB);
  const createdAt = new Date().toISOString();

  // Pre-allocate ids + phrases so we can do a single batched embedding
  // call instead of one round trip per triple.
  const prepared = triples.map((t) => ({
    id: newTripleId(),
    triple: t,
    phrase: `${t.subject} ${t.predicate} ${t.object}`,
  }));

  let embeddings: number[][] = [];
  try {
    embeddings = await embedMany(env, prepared.map((p) => p.phrase));
  } catch (err) {
    console.warn("kg_embed_many_failed", err);
  }

  // Vector upsert is best-effort; failures degrade us to D1-only KG
  // recall but don't drop the row.
  if (embeddings.length === prepared.length) {
    try {
      await env.MEMORY_INDEX.upsert(
        prepared.map((p, idx) => ({
          id: `kg:${p.id}`,
          values: embeddings[idx] as number[],
          metadata: {
            kind: "triple",
            agent_id: agentId,
            owner_id: ownerId,
            pid,
            tid: tid ?? "",
            source_memory_id: sourceMemoryId,
          },
        })),
      );
    } catch (err) {
      console.warn("kg_vector_upsert_failed", err);
    }
  }

  const rows = prepared.map((p, idx) => ({
    id: p.id,
    agent_id: agentId,
    owner_id: ownerId,
    pid,
    tid,
    subject: p.triple.subject,
    predicate: p.triple.predicate,
    object: p.triple.object,
    confidence: p.triple.confidence,
    source_memory_id: sourceMemoryId,
    vector_id:
      embeddings.length === prepared.length && embeddings[idx] ? `kg:${p.id}` : null,
    created_at: createdAt,
  }));

  // Single bulk insert avoids N round-trips to D1.
  for (let index = 0; index < rows.length; index += 50) {
    await db.insert(kgTriples).values(rows.slice(index, index + 50));
  }

  return rows;
}

// Hop-1 graph expansion: given a free-text query, find the triples whose
// subject or object matches a candidate entity. Cheap LIKE for now; can
// be upgraded to FTS5 later. The result is a deduplicated list of
// memory ids ranked by triple count.
export async function searchKg(
  dbBinding: D1Database,
  agentId: string,
  query: string,
  pid: string | null,
  tid: string | null,
  limit = 20,
): Promise<KgTripleRow[]> {
  // Trim and short-circuit too-short queries — a 1-character LIKE
  // matches nearly every triple and returns useless noise. SQLite's
  // default LIKE has no ESCAPE clause, so we strip the wildcard
  // characters instead of trying to escape them.
  const cleaned = query.trim();
  if (cleaned.length < 2) return [];
  const sanitized = cleaned.toLowerCase().replace(/[%_]/g, " ").trim();
  if (sanitized.length < 2) return [];
  const needle = `%${sanitized}%`;

  const db = createDb(dbBinding);
  const filters = [
    eq(kgTriples.agent_id, agentId),
    or(
      like(sql`lower(${kgTriples.subject})`, needle),
      like(sql`lower(${kgTriples.object})`, needle),
      like(sql`lower(${kgTriples.predicate})`, needle),
    ),
  ];
  if (pid) filters.push(eq(kgTriples.pid, pid));
  if (tid) filters.push(eq(kgTriples.tid, tid));
  return db
    .select()
    .from(kgTriples)
    .where(and(...filters))
    .orderBy(desc(kgTriples.confidence), desc(kgTriples.created_at))
    .limit(limit);
}
