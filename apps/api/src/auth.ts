import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import type { MiddlewareHandler } from "hono";
import { HttpError } from "./http";
import { sha256Hex } from "./ids";
import type { ApiKeyRow, HonoEnv, Principal } from "./types";

// Clerk middleware bound once per app. Reads CLERK_SECRET_KEY from env.
export const clerk = clerkMiddleware();

// Resolves a Principal from either a Clerk session or a `mst_*` bearer
// API key. Sets `c.var.principal` for downstream handlers.
export const requirePrincipal: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const authHeader = c.req.header("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (bearer.startsWith("mst_")) {
    const principal = await resolveApiKey(c.env.DB, bearer);
    if (!principal) throw new HttpError(401, "Invalid API key");
    c.set("principal", principal);
    return next();
  }

  // Fall through to Clerk.
  const session = getAuth(c);
  if (!session?.userId) throw new HttpError(401, "Authentication required");
  const ownerId = session.orgId ?? session.userId;
  c.set("principal", {
    source: "clerk",
    ownerId,
  } satisfies Principal);
  return next();
};

// Variant used on /v1/agents/* — Clerk only. API keys are scoped to a
// single agent and must not be allowed to manage other agents.
export const requireClerk: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const session = getAuth(c);
  if (!session?.userId) throw new HttpError(401, "Authentication required");
  const ownerId = session.orgId ?? session.userId;
  c.set("principal", { source: "clerk", ownerId });
  return next();
};

async function resolveApiKey(db: D1Database, raw: string): Promise<Principal | null> {
  const hash = await sha256Hex(raw);
  const row = await db
    .prepare(
      `SELECT * FROM api_keys
       WHERE token_hash = ?1 AND revoked_at IS NULL
       LIMIT 1`,
    )
    .bind(hash)
    .first<ApiKeyRow>();

  if (!row) return null;

  // Best-effort last_used_at update; failure here must not break auth.
  try {
    await db
      .prepare(`UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1`)
      .bind(row.id)
      .run();
  } catch (err) {
    console.warn("api_key last_used_at update failed", err);
  }

  return {
    source: "api_key",
    ownerId: row.owner_id,
    agentId: row.agent_id,
    apiKeyId: row.id,
  };
}
