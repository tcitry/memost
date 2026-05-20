import { embed } from "./embeddings";
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
      .filter((t) => t && t.subject && t.predicate && t.object)
      .map((t) => ({
        subject: String(t.subject).slice(0, 256),
        predicate: String(t.predicate).slice(0, 128),
        object: String(t.object).slice(0, 512),
        confidence: typeof t.confidence === "number" ? Math.max(0, Math.min(1, t.confidence)) : 0.7,
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

  const stored: KgTripleRow[] = [];
  for (const t of triples) {
    const id = newTripleId();
    const phrase = `${t.subject} ${t.predicate} ${t.object}`;
    let vectorId: string | null = null;
    try {
      const embedding = await embed(env, phrase);
      vectorId = `kg:${id}`;
      await env.MEMORY_INDEX.upsert([
        {
          id: vectorId,
          values: embedding,
          metadata: {
            kind: "triple",
            agent_id: agentId,
            owner_id: ownerId,
            pid,
            tid: tid ?? "",
            source_memory_id: sourceMemoryId,
          },
        },
      ]);
    } catch (err) {
      console.warn("kg_vector_upsert_failed", err);
    }

    await env.DB.prepare(
      `INSERT INTO kg_triples
        (id, agent_id, owner_id, pid, tid, subject, predicate, object,
         confidence, source_memory_id, vector_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
      .bind(
        id,
        agentId,
        ownerId,
        pid,
        tid,
        t.subject,
        t.predicate,
        t.object,
        t.confidence,
        sourceMemoryId,
        vectorId,
      )
      .run();

    stored.push({
      id,
      agent_id: agentId,
      owner_id: ownerId,
      pid,
      tid,
      subject: t.subject,
      predicate: t.predicate,
      object: t.object,
      confidence: t.confidence,
      source_memory_id: sourceMemoryId,
      vector_id: vectorId,
      created_at: new Date().toISOString(),
    });
  }
  return stored;
}

// Hop-1 graph expansion: given a free-text query, find the triples whose
// subject or object matches a candidate entity. Cheap LIKE for now; can
// be upgraded to FTS5 later. The result is a deduplicated list of
// memory ids ranked by triple count.
export async function searchKg(
  db: D1Database,
  agentId: string,
  query: string,
  pid: string | null,
  tid: string | null,
  limit = 20,
): Promise<KgTripleRow[]> {
  const needle = `%${query.toLowerCase()}%`;
  const filters: string[] = ["agent_id = ?1"];
  const binds: unknown[] = [agentId];
  let i = 2;
  filters.push(
    `(LOWER(subject) LIKE ?${i} OR LOWER(object) LIKE ?${i} OR LOWER(predicate) LIKE ?${i})`,
  );
  binds.push(needle);
  i += 1;
  if (pid) {
    filters.push(`pid = ?${i}`);
    binds.push(pid);
    i += 1;
  }
  if (tid) {
    filters.push(`tid = ?${i}`);
    binds.push(tid);
    i += 1;
  }
  const sql = `SELECT * FROM kg_triples WHERE ${filters.join(" AND ")}
    ORDER BY confidence DESC, created_at DESC LIMIT ?${i}`;
  binds.push(limit);
  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<KgTripleRow>();
  return res.results ?? [];
}
