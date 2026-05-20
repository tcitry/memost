import { Hono } from "hono";
import { requireClerk } from "../auth";
import { HttpError, readJson } from "../http";
import { generateApiKey, newAgentId, newApiKeyId } from "../ids";
import type { AgentRow, ApiKeyRow, HonoEnv } from "../types";

// /v1/agents/* — Clerk session required. API keys cannot manage other
// agents. All rows are owner_id-scoped (orgId or userId).
const app = new Hono<HonoEnv>();

app.use("*", requireClerk);

// List agents owned by the current principal.
app.get("/", async (c) => {
  const { ownerId } = c.var.principal;
  const res = await c.env.DB.prepare(
    `SELECT * FROM agents WHERE owner_id = ?1 ORDER BY created_at DESC`,
  )
    .bind(ownerId)
    .all<AgentRow>();
  return c.json({ agents: res.results ?? [] });
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

  await c.env.DB.prepare(
    `INSERT INTO agents (id, owner_id, name, description, default_pid)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(id, ownerId, name, description, defaultPid)
    .run();

  const agent = await c.env.DB.prepare(`SELECT * FROM agents WHERE id = ?1`)
    .bind(id)
    .first<AgentRow>();

  // Issue a default API key on creation so the playground can use it
  // immediately. We return the raw token only here.
  const key = await generateApiKey(c.env.MEMOST_ENV);
  const keyId = newApiKeyId();
  await c.env.DB.prepare(
    `INSERT INTO api_keys (id, agent_id, owner_id, name, prefix, token_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(keyId, id, ownerId, "default", key.prefix, key.hash)
    .run();

  return c.json({
    agent,
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
  const agent = await c.env.DB.prepare(
    `SELECT * FROM agents WHERE id = ?1 AND owner_id = ?2`,
  )
    .bind(c.req.param("id"), ownerId)
    .first<AgentRow>();
  if (!agent) throw new HttpError(404, "Agent not found");
  return c.json({ agent });
});

app.delete("/:id", async (c) => {
  const { ownerId } = c.var.principal;
  const id = c.req.param("id");
  const res = await c.env.DB.prepare(
    `DELETE FROM agents WHERE id = ?1 AND owner_id = ?2`,
  )
    .bind(id, ownerId)
    .run();
  if (!res.meta?.changes) throw new HttpError(404, "Agent not found");
  return c.json({ ok: true });
});

// API keys ---------------------------------------------------------------

app.get("/:id/keys", async (c) => {
  const { ownerId } = c.var.principal;
  const agentId = c.req.param("id");
  const owned = await c.env.DB.prepare(
    `SELECT id FROM agents WHERE id = ?1 AND owner_id = ?2`,
  )
    .bind(agentId, ownerId)
    .first<{ id: string }>();
  if (!owned) throw new HttpError(404, "Agent not found");

  const res = await c.env.DB.prepare(
    `SELECT id, agent_id, owner_id, name, prefix, last_used_at, revoked_at, created_at
     FROM api_keys WHERE agent_id = ?1 ORDER BY created_at DESC`,
  )
    .bind(agentId)
    .all<ApiKeyRow>();
  return c.json({ keys: res.results ?? [] });
});

app.post("/:id/keys", async (c) => {
  const { ownerId } = c.var.principal;
  const agentId = c.req.param("id");
  const body = await readJson<{ name?: string }>(c).catch(() => ({}) as { name?: string });
  const name = (body.name ?? "default").trim() || "default";

  const owned = await c.env.DB.prepare(
    `SELECT id FROM agents WHERE id = ?1 AND owner_id = ?2`,
  )
    .bind(agentId, ownerId)
    .first<{ id: string }>();
  if (!owned) throw new HttpError(404, "Agent not found");

  const key = await generateApiKey(c.env.MEMOST_ENV);
  const keyId = newApiKeyId();
  await c.env.DB.prepare(
    `INSERT INTO api_keys (id, agent_id, owner_id, name, prefix, token_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(keyId, agentId, ownerId, name, key.prefix, key.hash)
    .run();

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
  const res = await c.env.DB.prepare(
    `UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?1 AND agent_id = ?2 AND owner_id = ?3 AND revoked_at IS NULL`,
  )
    .bind(keyId, agentId, ownerId)
    .run();
  if (!res.meta?.changes) throw new HttpError(404, "API key not found");
  return c.json({ ok: true });
});

export default app;
