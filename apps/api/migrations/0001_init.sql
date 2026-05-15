CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  vector_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_memories_org_namespace
  ON memories (organization_id, namespace, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_subject
  ON memories (organization_id, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_agent
  ON memories (organization_id, agent_id, created_at DESC);
