export type MemoryRecord = {
  id: string;
  organization_id: string;
  subject_id: string;
  agent_id: string;
  namespace: string;
  content: string;
  metadata: string;
  vector_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MemoryResponse = Omit<MemoryRecord, "metadata"> & {
  metadata: Record<string, unknown>;
};

export type CreateMemoryInput = {
  organizationId: string;
  subjectId: string;
  agentId: string;
  namespace: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
};

export type SearchMemoryInput = {
  organizationId: string;
  namespace?: string;
  queryEmbedding?: number[];
  limit?: number;
};
