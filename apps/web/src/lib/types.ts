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
  subject_id?: string;
  namespace?: string;
  pid: string;
  tid: string | null;
  content: string;
  metadata: string;
  vector_id: string | null;
  created_at: string;
  updated_at: string;
  score?: number | null;
  semanticScore?: number | null;
  keywordScore?: number | null;
  graphScore?: number | null;
  recencyScore?: number;
  reasons?: string[];
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
  strategy?: "semantic" | "keyword" | "graph" | "hybrid";
  context?: {
    query: string;
    items: Array<{
      memoryId: string;
      content: string;
      score: number;
      scope: {
        pid: string;
        tid: string | null;
        subjectId: string;
      };
      citations: Array<{ type: "memory" | "triple"; id: string }>;
    }>;
  };
}

export interface AddResult {
  memory: Memory;
  triples: KgTriple[];
}

export interface EvalDataset {
  id: string;
  slug: string;
  name: string;
  version: string;
  storage_key: string;
  sample_count: number;
  question_count: number;
  metadata: string;
  imported_at: string;
  updated_at: string;
}

export interface EvalRun {
  id: string;
  owner_id: string;
  dataset_id: string;
  mode: "full" | "batch" | "single" | string;
  status: "queued" | "running" | "completed" | "failed" | "partial" | string;
  endpoint_url: string;
  endpoint_model: string;
  judge_url: string;
  judge_model: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  average_score: number | null;
  config: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface EvalResult {
  id: string;
  item_id: string;
  status: string;
  candidate_answer: string;
  judge_score: number | null;
  judge_passed: boolean | null;
  judge_reason: string;
  error: string | null;
  duration_ms: number | null;
  updated_at: string;
  question: string;
  expected_answer: string;
  sample_id: string;
  category: number | null;
}
