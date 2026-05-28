import { Hono } from "hono";
import { requirePrincipal } from "../auth";
import { HttpError, readJson } from "../http";
import { addMemory, deleteMemory, listMemories } from "../memory-service";
import { resolveAgent, buildMemoryScope } from "../scope";
import { retrieveMemories } from "../retrieval";
import type { HonoEnv } from "../types";

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
  // Force inline KG extraction. Default behaviour is to defer the
  // LLM round-trip via waitUntil so the response returns quickly.
  inlineKg?: boolean;
}

interface SearchBody {
  agentId?: string;
  query: string;
  pid?: string;
  tid?: string;
  limit?: number;
  includeKg?: boolean;
}

// POST /v1/memories — add a memory.
app.post("/", async (c) => {
  const body = await readJson<AddBody>(c);
  const content = (body.content ?? "").trim();
  if (!content) throw new HttpError(422, "Field 'content' is required");
  const agent = await resolveAgent(c, body.agentId);
  const principal = c.var.principal;
  const scope = buildMemoryScope({
    agent,
    ownerId: principal.ownerId,
    pid: body.pid,
    tid: body.tid,
    subjectId: body.subjectId,
    namespace: body.namespace,
  });
  // Defer KG extraction unless the caller explicitly wants the
  // triples returned inline (rare; useful for debugging/SDK tests).
  // `c.executionCtx.waitUntil` keeps the worker alive until the LLM
  // round-trip + embedding batch + bulk insert finish, while
  // returning the memory row to the client immediately.
  const inlineKg = body.inlineKg === true;
  const result = await addMemory(c.env, scope, {
    content,
    metadata: body.metadata,
    extractKg: body.extractKg,
    waitUntil: inlineKg ? undefined : c.executionCtx.waitUntil.bind(c.executionCtx),
  });
  return c.json(result);
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
  const result = await retrieveMemories(c.env, {
    agentId: agent.id,
    ownerId: principal.ownerId,
    query,
    pid,
    tid,
    limit,
    includeKg: body.includeKg !== false,
  });
  return c.json(result);
});

// GET /v1/memories — list with optional pid/tid filter.
app.get("/", async (c) => {
  const agent = await resolveAgent(c);
  const pid = c.req.query("pid")?.trim() || null;
  const tid = c.req.query("tid")?.trim() || null;
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const memories = await listMemories({
    db: c.env.DB,
    agentId: agent.id,
    pid,
    tid,
    limit,
  });
  return c.json({ memories });
});

// DELETE /v1/memories/:id
app.delete("/:id", async (c) => {
  const agent = await resolveAgent(c);
  const id = c.req.param("id");
  const removed = await deleteMemory({
    env: c.env,
    agentId: agent.id,
    memoryId: id,
  });
  if (!removed) throw new HttpError(404, "Memory not found");
  return c.json({ ok: true });
});

export default app;
