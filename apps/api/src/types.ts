// Shared types for the memo.st API worker.
// Bindings mirror wrangler.jsonc; keep in sync after edits.

export interface Bindings {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  MEMOST_ENV: "production" | "development";
  VECTOR_DIMENSIONS: string;
  EMBEDDING_MODEL: string;
  KG_LLM_MODEL: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
  CLERK_OAUTH_TOKEN_INTROSPECTION_URL?: string;
}

// Per-request principal. Either a Clerk-authenticated dashboard user
// (ownerId = orgId or userId) or an agent acting via an API key.
export interface Principal {
  source: "clerk" | "api_key";
  ownerId: string;
  // Only present for api_key auth — the agent that key belongs to.
  agentId?: string;
  apiKeyId?: string;
}

export interface AgentRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  default_pid: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  agent_id: string;
  owner_id: string;
  name: string;
  prefix: string;
  token_hash: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface MemoryRow {
  id: string;
  organization_id: string;
  owner_id: string;
  subject_id: string;
  agent_id: string;
  namespace: string;
  pid: string;
  tid: string | null;
  content: string;
  content_lower: string;
  metadata: string;
  vector_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KgTripleRow {
  id: string;
  agent_id: string;
  owner_id: string;
  pid: string;
  tid: string | null;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source_memory_id: string | null;
  vector_id: string | null;
  created_at: string;
}

// HonoEnv helper for typing app instances.
export type HonoEnv = {
  Bindings: Bindings;
  Variables: {
    principal: Principal;
  };
};
