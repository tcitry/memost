// Wire-format types shared between the dashboard server functions and
// the API worker. Keep in sync with apps/api/src/types.ts.

export interface Agent {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  default_pid: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  agent_id: string;
  owner_id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiKeyWithSecret extends Pick<ApiKey, "id" | "prefix" | "name"> {
  raw: string;
}

export interface Memory {
  id: string;
  agent_id: string;
  pid: string;
  tid: string | null;
  content: string;
  metadata: string;
  vector_id: string | null;
  created_at: string;
  updated_at: string;
  score?: number | null;
}

export interface KgTriple {
  id: string;
  agent_id: string;
  pid: string;
  tid: string | null;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source_memory_id: string | null;
  created_at: string;
}

export interface SearchResult {
  memories: Memory[];
  triples: KgTriple[];
}

export interface AddResult {
  memory: Memory;
  triples: KgTriple[];
}
