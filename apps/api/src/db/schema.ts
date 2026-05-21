import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
