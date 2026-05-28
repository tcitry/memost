import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  default_pid: text("default_pid").notNull().default("default"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  agent_id: text("agent_id").notNull(),
  owner_id: text("owner_id").notNull(),
  name: text("name").notNull().default("default"),
  prefix: text("prefix").notNull(),
  token_hash: text("token_hash").notNull(),
  last_used_at: text("last_used_at"),
  revoked_at: text("revoked_at"),
  created_at: text("created_at").notNull(),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  organization_id: text("organization_id").notNull(),
  owner_id: text("owner_id").notNull(),
  subject_id: text("subject_id").notNull(),
  agent_id: text("agent_id").notNull(),
  namespace: text("namespace").notNull(),
  pid: text("pid").notNull().default("default"),
  tid: text("tid"),
  content: text("content").notNull(),
  content_lower: text("content_lower").notNull().default(""),
  metadata: text("metadata").notNull().default("{}"),
  vector_id: text("vector_id"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const kgTriples = sqliteTable("kg_triples", {
  id: text("id").primaryKey(),
  agent_id: text("agent_id").notNull(),
  owner_id: text("owner_id").notNull(),
  pid: text("pid").notNull().default("default"),
  tid: text("tid"),
  subject: text("subject").notNull(),
  predicate: text("predicate").notNull(),
  object: text("object").notNull(),
  confidence: real("confidence").notNull().default(1),
  source_memory_id: text("source_memory_id"),
  vector_id: text("vector_id"),
  created_at: text("created_at").notNull(),
});

export const evalDatasets = sqliteTable("eval_datasets", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  storage_key: text("storage_key").notNull(),
  sample_count: integer("sample_count").notNull().default(0),
  question_count: integer("question_count").notNull().default(0),
  metadata: text("metadata").notNull().default("{}"),
  imported_at: text("imported_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const evalItems = sqliteTable("eval_items", {
  id: text("id").primaryKey(),
  dataset_id: text("dataset_id").notNull(),
  sample_id: text("sample_id").notNull(),
  question_index: integer("question_index").notNull(),
  question: text("question").notNull(),
  expected_answer: text("expected_answer").notNull(),
  category: integer("category"),
  evidence: text("evidence").notNull().default("[]"),
  sample_storage_key: text("sample_storage_key").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  created_at: text("created_at").notNull(),
});

export const evalRuns = sqliteTable("eval_runs", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  dataset_id: text("dataset_id").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  endpoint_url: text("endpoint_url").notNull(),
  endpoint_model: text("endpoint_model").notNull().default(""),
  judge_url: text("judge_url").notNull().default(""),
  judge_model: text("judge_model").notNull().default(""),
  total_items: integer("total_items").notNull().default(0),
  completed_items: integer("completed_items").notNull().default(0),
  failed_items: integer("failed_items").notNull().default(0),
  average_score: real("average_score"),
  config: text("config").notNull().default("{}"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  completed_at: text("completed_at"),
});

export const evalRunSecrets = sqliteTable("eval_run_secrets", {
  run_id: text("run_id").primaryKey(),
  payload: text("payload").notNull(),
  expires_at: text("expires_at").notNull(),
  created_at: text("created_at").notNull(),
});

export const evalResults = sqliteTable("eval_results", {
  id: text("id").primaryKey(),
  run_id: text("run_id").notNull(),
  item_id: text("item_id").notNull(),
  status: text("status").notNull(),
  candidate_answer: text("candidate_answer").notNull().default(""),
  judge_score: real("judge_score"),
  judge_passed: integer("judge_passed", { mode: "boolean" }),
  judge_reason: text("judge_reason").notNull().default(""),
  error: text("error"),
  duration_ms: integer("duration_ms"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});
