import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireClerk } from "../auth";
import { createDb } from "../db/client";
import { agents, apiKeys } from "../db/schema";
import { HttpError, readJson } from "../http";
import { generateApiKey, newAgentId, newApiKeyId } from "../ids";
import { deleteAgentCascade } from "../memory-service";
import type { HonoEnv } from "../types";

// /v1/agents/* — Clerk session required. API keys cannot manage other
// agents. All rows are owner_id-scoped (orgId or userId).
const app = new Hono<HonoEnv>();

app.use("*", requireClerk);

// List agents owned by the current principal.
app.get("/", async (c) => {
  const { ownerId } = c.var.principal;
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.owner_id, ownerId))
    .orderBy(desc(agents.created_at));
  return c.json({ agents: rows });
});

interface CreateAgentBody {
  name?: string;
  description?: string;
  defaultPid?: string;
}

app.post("/", async (c) => {
  const body = await readJson<CreateAgentBody>(c);
  const name = (body.name ?? "").trim();
  if (!name) throw new HttpError(422, "Field 'name' is required");
  const description = (body.description ?? "").trim();
  const defaultPid = (body.defaultPid ?? "default").trim() || "default";
  const id = newAgentId();
  const { ownerId } = c.var.principal;
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  await db.insert(agents).values({
    id,
    owner_id: ownerId,
    name,
    description,
    default_pid: defaultPid,
    created_at: now,
    updated_at: now,
  });

  // Issue a default API key on creation so the playground can use it
  // immediately. We return the raw token only here.
  const key = await generateApiKey(c.env.MEMOST_ENV);
  const keyId = newApiKeyId();
  await db.insert(apiKeys).values({
    id: keyId,
    agent_id: id,
    owner_id: ownerId,
    name: "default",
    prefix: key.prefix,
    token_hash: key.hash,
    created_at: now,
  });

  return c.json({
    agent: {
      id,
      owner_id: ownerId,
      name,
      description,
      default_pid: defaultPid,
      created_at: now,
      updated_at: now,
    },
    apiKey: {
      id: keyId,
      prefix: key.prefix,
      raw: key.raw,
      name: "default",
    },
  });
});

app.get("/:id", async (c) => {
  const { ownerId } = c.var.principal;
  const db = createDb(c.env.DB);
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, c.req.param("id")), eq(agents.owner_id, ownerId)),
  });
  if (!agent) throw new HttpError(404, "Agent not found");
  return c.json({ agent });
});

// D1 has FK declarations but does not enforce them by default, so we
// walk every dependent table explicitly. Order: vectors + memory/kg
// rows first (via deleteAgentCascade), then api_keys, finally the
// agent itself.
app.delete("/:id", async (c) => {
  const { ownerId } = c.var.principal;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);
  const existing = await db.query.agents.findFirst({
    where: and(eq(agents.id, id), eq(agents.owner_id, ownerId)),
    columns: { id: true },
  });
  if (!existing) throw new HttpError(404, "Agent not found");

  await deleteAgentCascade({ env: c.env, agentId: id });
  await db.delete(apiKeys).where(eq(apiKeys.agent_id, id));
  await db.delete(agents).where(and(eq(agents.id, id), eq(agents.owner_id, ownerId)));
  return c.json({ ok: true });
});

// API keys ---------------------------------------------------------------

app.get("/:id/keys", async (c) => {
  const { ownerId } = c.var.principal;
  const agentId = c.req.param("id");
  const db = createDb(c.env.DB);
  const owned = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.owner_id, ownerId)),
    columns: { id: true },
  });
  if (!owned) throw new HttpError(404, "Agent not found");

  const rows = await db
    .select({
      id: apiKeys.id,
      agent_id: apiKeys.agent_id,
      owner_id: apiKeys.owner_id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      last_used_at: apiKeys.last_used_at,
      revoked_at: apiKeys.revoked_at,
      created_at: apiKeys.created_at,
    })
    .from(apiKeys)
    .where(eq(apiKeys.agent_id, agentId))
    .orderBy(desc(apiKeys.created_at));
  return c.json({ keys: rows });
});

app.post("/:id/keys", async (c) => {
  const { ownerId } = c.var.principal;
  const agentId = c.req.param("id");
  const body = await readJson<{ name?: string }>(c).catch(() => ({}) as { name?: string });
  const name = (body.name ?? "default").trim() || "default";
  const db = createDb(c.env.DB);

  const owned = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.owner_id, ownerId)),
    columns: { id: true },
  });
  if (!owned) throw new HttpError(404, "Agent not found");

  const key = await generateApiKey(c.env.MEMOST_ENV);
  const keyId = newApiKeyId();
  await db.insert(apiKeys).values({
    id: keyId,
    agent_id: agentId,
    owner_id: ownerId,
    name,
    prefix: key.prefix,
    token_hash: key.hash,
    created_at: new Date().toISOString(),
  });

  return c.json({
    id: keyId,
    prefix: key.prefix,
    raw: key.raw,
    name,
  });
});

app.delete("/:id/keys/:keyId", async (c) => {
  const { ownerId } = c.var.principal;
  const agentId = c.req.param("id");
  const keyId = c.req.param("keyId");
  const db = createDb(c.env.DB);
  const existing = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.id, keyId),
      eq(apiKeys.agent_id, agentId),
      eq(apiKeys.owner_id, ownerId),
      isNull(apiKeys.revoked_at),
    ),
    columns: { id: true },
  });
  if (!existing) throw new HttpError(404, "API key not found");
  await db
    .update(apiKeys)
    .set({ revoked_at: new Date().toISOString() })
    .where(eq(apiKeys.id, keyId));
  return c.json({ ok: true });
});

export default app;
