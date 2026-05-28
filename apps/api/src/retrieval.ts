import { and, desc, eq, inArray, like } from "drizzle-orm";
import { createDb } from "./db/client";
import { memories } from "./db/schema";
import { embed } from "./embeddings";
import { searchKg } from "./kg";
import type { Bindings, KgTripleRow, MemoryRow } from "./types";

export type RetrievalStrategy = "semantic" | "keyword" | "graph" | "hybrid";

export interface RetrievalRequest {
  agentId: string;
  ownerId: string;
  query: string;
  pid: string | null;
  tid: string | null;
  limit: number;
  includeKg: boolean;
}

export interface MemoryMatch extends MemoryRow {
  score: number | null;
  semanticScore: number | null;
  keywordScore: number | null;
  graphScore: number | null;
  recencyScore: number;
  reasons: string[];
}

export interface ContextItem {
  memoryId: string;
  content: string;
  score: number;
  scope: {
    pid: string;
    tid: string | null;
    subjectId: string;
  };
  citations: Array<{
    type: "memory" | "triple";
    id: string;
  }>;
}

export interface RetrievalResult {
  strategy: RetrievalStrategy;
  memories: MemoryMatch[];
  triples: KgTripleRow[];
  context: {
    query: string;
    items: ContextItem[];
  };
}

interface RankedMemory {
  row: MemoryRow;
  semanticScore: number | null;
  keywordScore: number | null;
  graphScore: number | null;
  recencyScore: number;
  score: number;
  reasons: Set<string>;
}

export async function retrieveMemories(
  env: Bindings,
  req: RetrievalRequest,
): Promise<RetrievalResult> {
  const semanticHits = await querySemantic(env, req);
  const [semanticRows, keywordRows, triples] = await Promise.all([
    hydrateSemanticRows(env.DB, req.agentId, semanticHits),
    queryKeyword(env.DB, req),
    req.includeKg
      ? searchKg(env.DB, req.agentId, req.query, req.pid, req.tid, req.limit * 2)
      : Promise.resolve([]),
  ]);
  const graphRows = await hydrateGraphRows(env.DB, req.agentId, triples, req.limit * 2);

  const ranked = new Map<string, RankedMemory>();
  for (const row of semanticRows) {
    const semanticScore = semanticHits.get(row.id) ?? null;
    mergeRanked(ranked, row, {
      semanticScore,
      reason: "semantic",
      scoreDelta: semanticScore ? semanticScore * 0.7 : 0,
    });
  }
  for (const row of keywordRows) {
    const keywordScore = keywordScoreFor(row.content, req.query);
    mergeRanked(ranked, row, {
      keywordScore,
      reason: "keyword",
      scoreDelta: keywordScore * 0.45,
    });
  }
  for (const row of graphRows) {
    const graphScore = graphScoreFor(row.id, triples);
    mergeRanked(ranked, row, {
      graphScore,
      reason: "graph",
      scoreDelta: graphScore * 0.35,
    });
  }

  const memories = Array.from(ranked.values())
    .map((item) => finalizeRank(item))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, req.limit);

  const strategy = pickStrategy({
    semantic: semanticRows.length,
    keyword: keywordRows.length,
    graph: graphRows.length,
  });

  return {
    strategy,
    memories,
    triples,
    context: {
      query: req.query,
      items: memories.map((memory) => ({
        memoryId: memory.id,
        content: memory.content,
        score: memory.score ?? 0,
        scope: {
          pid: memory.pid,
          tid: memory.tid,
          subjectId: memory.subject_id,
        },
        citations: [
          { type: "memory", id: memory.id },
          ...triples
            .filter((t) => t.source_memory_id === memory.id)
            .slice(0, 3)
            .map((t) => ({ type: "triple" as const, id: t.id })),
        ],
      })),
    },
  };
}

async function querySemantic(
  env: Bindings,
  req: RetrievalRequest,
): Promise<Map<string, number>> {
  const hits = new Map<string, number>();
  try {
    const embedding = await embed(env, req.query);
    const filter: Record<string, string> = {
      kind: "memory",
      agent_id: req.agentId,
      owner_id: req.ownerId,
    };
    if (req.pid) filter.pid = req.pid;
    if (req.tid) filter.tid = req.tid;
    const vres = await env.MEMORY_INDEX.query(embedding, {
      topK: req.limit * 2,
      filter: filter as never,
      returnMetadata: "none",
    });
    for (const m of vres.matches ?? []) {
      hits.set(m.id.replace(/^mem:/, ""), m.score ?? 0);
    }
  } catch (err) {
    console.warn("vector_query_failed", err);
  }
  return hits;
}

async function hydrateSemanticRows(
  db: D1Database,
  agentId: string,
  hits: Map<string, number>,
): Promise<MemoryRow[]> {
  const ids = Array.from(hits.keys());
  if (ids.length === 0) return [];
  const orm = createDb(db);
  const rows = await orm
    .select()
    .from(memories)
    .where(and(eq(memories.agent_id, agentId), inArray(memories.id, ids)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is MemoryRow => Boolean(row));
}

async function queryKeyword(db: D1Database, req: RetrievalRequest): Promise<MemoryRow[]> {
  // Sanitize SQL LIKE wildcards (SQLite has no default ESCAPE) and
  // short-circuit overly broad queries that would scan the table.
  const cleaned = req.query.trim().toLowerCase();
  if (cleaned.length < 2) return [];
  const sanitized = cleaned.replace(/[%_]/g, " ").trim();
  if (sanitized.length < 2) return [];

  const orm = createDb(db);
  const filters = [
    eq(memories.agent_id, req.agentId),
    like(memories.content_lower, `%${sanitized}%`),
  ];
  if (req.pid) filters.push(eq(memories.pid, req.pid));
  if (req.tid) filters.push(eq(memories.tid, req.tid));
  return orm
    .select()
    .from(memories)
    .where(and(...filters))
    .orderBy(desc(memories.created_at))
    .limit(req.limit * 2);
}

async function hydrateGraphRows(
  db: D1Database,
  agentId: string,
  triples: KgTripleRow[],
  limit: number,
): Promise<MemoryRow[]> {
  const ids = Array.from(
    new Set(triples.map((t) => t.source_memory_id).filter((id): id is string => Boolean(id))),
  ).slice(0, limit);
  if (ids.length === 0) return [];
  const orm = createDb(db);
  const rows = await orm
    .select()
    .from(memories)
    .where(and(eq(memories.agent_id, agentId), inArray(memories.id, ids)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is MemoryRow => Boolean(row));
}

function mergeRanked(
  ranked: Map<string, RankedMemory>,
  row: MemoryRow,
  patch: {
    semanticScore?: number | null;
    keywordScore?: number | null;
    graphScore?: number | null;
    scoreDelta: number;
    reason: string;
  },
): void {
  const current =
    ranked.get(row.id) ??
    ({
      row,
      semanticScore: null,
      keywordScore: null,
      graphScore: null,
      recencyScore: recencyScore(row.created_at),
      score: 0,
      reasons: new Set<string>(),
    } satisfies RankedMemory);
  current.semanticScore = maxNullable(current.semanticScore, patch.semanticScore);
  current.keywordScore = maxNullable(current.keywordScore, patch.keywordScore);
  current.graphScore = maxNullable(current.graphScore, patch.graphScore);
  current.score += patch.scoreDelta;
  current.reasons.add(patch.reason);
  ranked.set(row.id, current);
}

// Sum of all weights that contribute to a memory's blended score.
// Used to normalize the final value into [0, 1] so the dashboard can
// render it as "match strength" without needing prior-knowledge of the
// internal weighting.
const SCORE_WEIGHT_TOTAL = 0.7 + 0.45 + 0.35 + 0.12 + 0.08;

function finalizeRank(item: RankedMemory): MemoryMatch {
  const scopeBoost = item.row.tid ? 0.08 : 0.04;
  const raw = item.score + item.recencyScore * 0.12 + scopeBoost;
  const score = Math.max(0, Math.min(1, raw / SCORE_WEIGHT_TOTAL));
  return {
    ...item.row,
    score,
    semanticScore: item.semanticScore,
    keywordScore: item.keywordScore,
    graphScore: item.graphScore,
    recencyScore: item.recencyScore,
    reasons: Array.from(item.reasons),
  };
}

function keywordScoreFor(content: string, query: string): number {
  const haystack = new Set(tokenize(content));
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((token) => haystack.has(token)).length;
  return hits / tokens.length;
}

function graphScoreFor(memoryId: string, triples: KgTripleRow[]): number {
  const related = triples.filter((t) => t.source_memory_id === memoryId);
  if (related.length === 0) return 0;
  const confidence = related.reduce((sum, t) => sum + t.confidence, 0) / related.length;
  return Math.min(1, confidence * Math.log2(related.length + 1));
}

function recencyScore(createdAt: string): number {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return 0;
  const ageDays = Math.max(0, (Date.now() - created) / 86_400_000);
  return 1 / (1 + ageDays / 30);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function maxNullable(
  a: number | null,
  b: number | null | undefined,
): number | null {
  if (b == null) return a;
  if (a == null) return b;
  return Math.max(a, b);
}

function pickStrategy(counts: {
  semantic: number;
  keyword: number;
  graph: number;
}): RetrievalStrategy {
  const active = [counts.semantic, counts.keyword, counts.graph].filter((n) => n > 0).length;
  if (active > 1) return "hybrid";
  if (counts.semantic > 0) return "semantic";
  if (counts.graph > 0) return "graph";
  return "keyword";
}
