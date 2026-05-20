import { Hono } from "hono";
import type { Context } from "hono";
import { requirePrincipal } from "../auth";
import { embed } from "../embeddings";
import { HttpError, readJson } from "../http";
import { newMemoryId } from "../ids";
import { extractTriples, searchKg, storeTriples } from "../kg";
import type { AgentRow, HonoEnv, KgTripleRow, MemoryRow } from "../types";

// /v1/memories/* — accepts either Clerk session (with X-Agent-Id header
// or `agentId` body field) or an API key (agent inferred from the key).
const app = new Hono<HonoEnv>();

app.use("*", requirePrincipal);

interface AddBody {
  agentId?: string;
  content: string;
  pid?: string;
  tid?: string;
  subjectId?: string;
  namespace?: string;
  metadata?: Record<string, unknown>;
  extractKg?: boolean;
}

interface SearchBody {
  agentId?: string;
  query: string;
  pid?: string;
  tid?: string;
  limit?: number;
  includeKg?: boolean;
}

async function resolveAgent(
  c: Context<HonoEnv>,
  bodyAgentId?: string,
): Promise<AgentRow> {
  const principal = c.var.principal;
  const headerAgent = c.req.header("x-agent-id") ?? "";
  const candidate =
    principal.source === "api_key"
      ? principal.agentId
      : bodyAgentId ?? c.req.query("agentId") ?? headerAgent;
  if (!candidate) throw new HttpError(422, "Missing agent id");
  const agent = await c.env.DB.prepare(
    `SELECT * FROM agents WHERE id = ?1 AND owner_id = ?2`,
  )
    .bind(candidate, principal.ownerId)
    .first<AgentRow>();
  if (!agent) throw new HttpError(404, "Agent not found");
  return agent;
}

// POST /v1/memories — add a memory.
app.post("/", async (c) => {
  const body = await readJson<AddBody>(c);
  const content = (body.content ?? "").trim();
  if (!content) throw new HttpError(422, "Field 'content' is required");
  const agent = await resolveAgent(c, body.agentId);
  const principal = c.var.principal;

  const pid = (body.pid ?? agent.default_pid).trim() || agent.default_pid;
  const tid = body.tid?.trim() || null;
  const subjectId = (body.subjectId ?? principal.ownerId).trim() || principal.ownerId;
  const namespace = (body.namespace ?? `${pid}${tid ? `/${tid}` : ""}`).trim();
  const metadataJson = JSON.stringify(body.metadata ?? {});

  const id = newMemoryId();
  const vectorId = `mem:${id}`;

  // Embed + upsert vector first; if vectorize fails we still keep the
  // row so text search remains useful.
  let storedVectorId: string | null = null;
  try {
    const embedding = await embed(c.env, content);
    await c.env.MEMORY_INDEX.upsert([
      {
        id: vectorId,
        values: embedding,
        metadata: {
          kind: "memory",
          agent_id: agent.id,
          owner_id: principal.ownerId,
          pid,
          tid: tid ?? "",
        },
      },
    ]);
    storedVectorId = vectorId;
  } catch (err) {
    console.warn("vector_upsert_failed", err);
  }

  await c.env.DB.prepare(
    `INSERT INTO memories
       (id, organization_id, owner_id, subject_id, agent_id, namespace,
        pid, tid, content, content_lower, metadata, vector_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
  )
    .bind(
      id,
      principal.ownerId,
      principal.ownerId,
      subjectId,
      agent.id,
      namespace,
      pid,
      tid,
      content,
      content.toLowerCase(),
      metadataJson,
      storedVectorId,
    )
    .run();

  // Optional KG extraction. Default ON for the playground; SDKs can
  // disable with extractKg: false to save AI cost.
  let triples: KgTripleRow[] = [];
  if (body.extractKg !== false) {
    try {
      const extracted = await extractTriples(c.env, content);
      triples = await storeTriples({
        env: c.env,
        agentId: agent.id,
        ownerId: principal.ownerId,
        pid,
        tid,
        sourceMemoryId: id,
        triples: extracted,
      });
    } catch (err) {
      console.warn("kg_extract_or_store_failed", err);
    }
  }

  const memory = await c.env.DB.prepare(
    `SELECT * FROM memories WHERE id = ?1`,
  )
    .bind(id)
    .first<MemoryRow>();

  return c.json({ memory, triples });
});

// POST /v1/memories/search — vector-first, text + KG fallback.
app.post("/search", async (c) => {
  const body = await readJson<SearchBody>(c);
  const query = (body.query ?? "").trim();
  if (!query) throw new HttpError(422, "Field 'query' is required");
  const limit = Math.min(50, Math.max(1, body.limit ?? 10));
  const agent = await resolveAgent(c, body.agentId);
  const principal = c.var.principal;

  const pid = body.pid?.trim() || null;
  const tid = body.tid?.trim() || null;

  // 1) Vector search.
  const vectorHits: Array<{ id: string; score: number }> = [];
  try {
    const embedding = await embed(c.env, query);
    const filter: Record<string, string> = {
      kind: "memory",
      agent_id: agent.id,
      owner_id: principal.ownerId,
    };
    if (pid) filter.pid = pid;
    if (tid) filter.tid = tid;

    const vres = await c.env.MEMORY_INDEX.query(embedding, {
      topK: limit,
      filter: filter as never,
      returnMetadata: "none",
    });
    for (const m of vres.matches ?? []) {
      vectorHits.push({ id: m.id.replace(/^mem:/, ""), score: m.score ?? 0 });
    }
  } catch (err) {
    console.warn("vector_query_failed", err);
  }

  // 2) Hydrate D1 rows for vector hits.
  let memoryRows: MemoryRow[] = [];
  if (vectorHits.length > 0) {
    const placeholders = vectorHits.map((_, i) => `?${i + 2}`).join(", ");
    const sql = `SELECT * FROM memories
                 WHERE agent_id = ?1 AND id IN (${placeholders})`;
    const rs = await c.env.DB.prepare(sql)
      .bind(agent.id, ...vectorHits.map((h) => h.id))
      .all<MemoryRow>();
    const byId = new Map((rs.results ?? []).map((r) => [r.id, r]));
    memoryRows = vectorHits
      .map((h) => byId.get(h.id))
      .filter((r): r is MemoryRow => Boolean(r));
  }

  // 3) Text fallback if vector returned nothing.
  if (memoryRows.length === 0) {
    const filters: string[] = ["agent_id = ?1", "content_lower LIKE ?2"];
    const binds: unknown[] = [agent.id, `%${query.toLowerCase()}%`];
    let i = 3;
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
    const sql = `SELECT * FROM memories WHERE ${filters.join(" AND ")}
                 ORDER BY created_at DESC LIMIT ?${i}`;
    binds.push(limit);
    const rs = await c.env.DB.prepare(sql)
      .bind(...binds)
      .all<MemoryRow>();
    memoryRows = rs.results ?? [];
  }

  // 4) KG fan-out (optional).
  let triples: KgTripleRow[] = [];
  if (body.includeKg !== false) {
    try {
      triples = await searchKg(c.env.DB, agent.id, query, pid, tid, limit);
    } catch (err) {
      console.warn("kg_search_failed", err);
    }
  }

  return c.json({
    memories: memoryRows.map((row) => ({
      ...row,
      score: vectorHits.find((h) => h.id === row.id)?.score ?? null,
    })),
    triples,
  });
});

// GET /v1/memories — list with optional pid/tid filter.
app.get("/", async (c) => {
  const agent = await resolveAgent(c);
  const pid = c.req.query("pid")?.trim() || null;
  const tid = c.req.query("tid")?.trim() || null;
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));

  const filters: string[] = ["agent_id = ?1"];
  const binds: unknown[] = [agent.id];
  let i = 2;
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
  const sql = `SELECT * FROM memories WHERE ${filters.join(" AND ")}
               ORDER BY created_at DESC LIMIT ?${i}`;
  binds.push(limit);
  const rs = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<MemoryRow>();
  return c.json({ memories: rs.results ?? [] });
});

// DELETE /v1/memories/:id
app.delete("/:id", async (c) => {
  const agent = await resolveAgent(c);
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT vector_id FROM memories WHERE id = ?1 AND agent_id = ?2`,
  )
    .bind(id, agent.id)
    .first<{ vector_id: string | null }>();
  if (!row) throw new HttpError(404, "Memory not found");

  if (row.vector_id) {
    try {
      await c.env.MEMORY_INDEX.deleteByIds([row.vector_id]);
    } catch (err) {
      console.warn("vector_delete_failed", err);
    }
  }

  await c.env.DB.prepare(`DELETE FROM kg_triples WHERE source_memory_id = ?1`)
    .bind(id)
    .run();
  await c.env.DB.prepare(`DELETE FROM memories WHERE id = ?1 AND agent_id = ?2`)
    .bind(id, agent.id)
    .run();

  return c.json({ ok: true });
});

export default app;
