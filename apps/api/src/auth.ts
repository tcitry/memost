import { clerkMiddleware, getAuth } from "@clerk/hono";
import { and, eq, isNull } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { createDb } from "./db/client";
import { apiKeys } from "./db/schema";
import { HttpError } from "./http";
import { sha256Hex } from "./ids";
import type { HonoEnv, Principal } from "./types";

// Clerk middleware bound once per app. Reads CLERK_SECRET_KEY from env.
export const clerk = clerkMiddleware();

interface OAuthIntrospectionResponse {
  active?: boolean;
  sub?: string;
  org_id?: string;
  scope?: string;
  token_type?: string;
  exp?: number;
}

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
  if (session?.userId) {
    const ownerId = session.orgId ?? session.userId;
    c.set("principal", {
      source: "clerk",
      ownerId,
    } satisfies Principal);
    return next();
  }

  if (bearer) {
    const principal = await resolveOAuthAccessToken(c.env, bearer);
    if (principal) {
      c.set("principal", principal);
      return next();
    }
  }

  throw new HttpError(401, "Authentication required");
};

// Variant used on /v1/agents/* and /v1/evals/* — accepts a Clerk
// session OR a Clerk OAuth access token (with required scope). API
// keys (mst_*) are intentionally rejected here because they are
// scoped to a single agent and must not manage other agents.
export const requireClerk: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const session = getAuth(c);
  if (session?.userId) {
    const ownerId = session.orgId ?? session.userId;
    c.set("principal", { source: "clerk", ownerId });
    return next();
  }

  const authHeader = c.req.header("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (bearer) {
    const principal = await resolveOAuthAccessToken(c.env, bearer);
    if (principal) {
      c.set("principal", principal);
      return next();
    }
  }

  throw new HttpError(401, "Authentication required");
};

// In-memory cache of OAuth introspection results. Keyed by the SHA-256
// of the raw token to avoid retaining the token in memory. TTL is min
// of (5 minutes, token exp).
interface CachedIntrospection {
  principal: Principal;
  expiresAt: number;
}
const introspectionCache = new Map<string, CachedIntrospection>();

async function resolveOAuthAccessToken(
  env: HonoEnv["Bindings"],
  raw: string,
): Promise<Principal | null> {
  const url = env.CLERK_OAUTH_TOKEN_INTROSPECTION_URL;
  if (!url) return null;

  const cacheKey = await sha256Hex(raw);
  const cached = introspectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.principal;
  }

  const body = new URLSearchParams({ token: raw });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
    },
    body,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as OAuthIntrospectionResponse;
  if (!json.active || !json.sub) return null;

  // If a required scope is configured, the token must include it. This
  // prevents arbitrary third-party OAuth client tokens from accessing
  // memost data.
  const required = env.CLERK_OAUTH_REQUIRED_SCOPE?.trim();
  if (required) {
    const scopes = (json.scope ?? "").split(/\s+/).filter(Boolean);
    if (!scopes.includes(required)) return null;
  }

  const principal: Principal = {
    source: "clerk",
    ownerId: json.org_id ?? json.sub,
  };
  const ttlMs = Math.min(
    5 * 60_000,
    typeof json.exp === "number" ? json.exp * 1000 - Date.now() : 5 * 60_000,
  );
  if (ttlMs > 0) {
    introspectionCache.set(cacheKey, {
      principal,
      expiresAt: Date.now() + ttlMs,
    });
    if (introspectionCache.size > 1024) {
      // Crude LRU pressure relief — drop the oldest 256 entries.
      const oldest = Array.from(introspectionCache.entries())
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
        .slice(0, 256);
      for (const [key] of oldest) introspectionCache.delete(key);
    }
  }
  return principal;
}

async function resolveApiKey(db: D1Database, raw: string): Promise<Principal | null> {
  const hash = await sha256Hex(raw);
  const orm = createDb(db);
  const row = await orm.query.apiKeys.findFirst({
    where: and(eq(apiKeys.token_hash, hash), isNull(apiKeys.revoked_at)),
  });

  if (!row) return null;

  // Best-effort last_used_at update; failure here must not break auth.
  try {
    await orm
      .update(apiKeys)
      .set({ last_used_at: new Date().toISOString() })
      .where(eq(apiKeys.id, row.id));
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
