-- 0002_agents_kg.sql
-- Adds: agents, API keys, knowledge-graph triples, and pid/tid columns
-- on memories. owner_id is a Clerk user id OR org id (whichever the
-- session resolves to); api keys are scoped to a single agent.

-- ----------------------------------------------------------------------
-- agents: a logical AI agent owned by a user/org. One agent → one or
-- more API keys. memories and kg_triples reference agent_id directly.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_pid TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_owner
  ON agents (owner_id, created_at DESC);

-- ----------------------------------------------------------------------
-- api_keys: hashed credentials for an agent. We store the SHA-256 of the
-- raw token plus a short prefix for UI display ("mst_live_abcd...").
-- The raw token is only returned once at creation time.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_agent
  ON api_keys (agent_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON api_keys (token_hash);

-- ----------------------------------------------------------------------
-- memories: extend the 0001 table with process/thread identifiers.
-- pid = "process" (project / long-running session). Defaults to 'default'.
-- tid = "thread" (a single conversation). NULL when not applicable.
-- ----------------------------------------------------------------------
ALTER TABLE memories ADD COLUMN pid TEXT NOT NULL DEFAULT 'default';
ALTER TABLE memories ADD COLUMN tid TEXT;
ALTER TABLE memories ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_memories_pid
  ON memories (agent_id, pid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_tid
  ON memories (agent_id, tid, created_at DESC);

-- Lightweight FTS-style fallback for when vector search is unavailable.
-- Use D1 LIKE on a lowercased shadow column for now; FTS5 virtual
-- tables can be added later behind a feature flag.
ALTER TABLE memories ADD COLUMN content_lower TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_memories_content_lower
  ON memories (content_lower);

-- ----------------------------------------------------------------------
-- kg_triples: edge-native knowledge graph. Each triple is grounded in a
-- specific memory (source_memory_id) so we can always cite origins, and
-- carries pid/tid for scoped traversal.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kg_triples (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  pid TEXT NOT NULL DEFAULT 'default',
  tid TEXT,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source_memory_id TEXT,
  vector_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_kg_subject
  ON kg_triples (agent_id, subject);

CREATE INDEX IF NOT EXISTS idx_kg_object
  ON kg_triples (agent_id, object);

CREATE INDEX IF NOT EXISTS idx_kg_predicate
  ON kg_triples (agent_id, predicate);

CREATE INDEX IF NOT EXISTS idx_kg_pid_tid
  ON kg_triples (agent_id, pid, tid);
