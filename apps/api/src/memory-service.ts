import { and, desc, eq } from "drizzle-orm";
import { embed } from "./embeddings";
import { newMemoryId } from "./ids";
import { extractTriples, storeTriples } from "./kg";
import type { Bindings, KgTripleRow, MemoryRow } from "./types";
import type { MemoryScope } from "./scope";
import { createDb } from "./db/client";
import { kgTriples, memories } from "./db/schema";

export interface AddMemoryInput {
  content: string;
  metadata?: Record<string, unknown>;
  extractKg?: boolean;
}

export interface AddMemoryResult {
  memory: MemoryRow;
  triples: KgTripleRow[];
}

export async function addMemory(
  env: Bindings,
  scope: MemoryScope,
  input: AddMemoryInput,
): Promise<AddMemoryResult> {
  const content = input.content.trim();
  const id = newMemoryId();
  const vectorId = `mem:${id}`;
  const metadataJson = JSON.stringify(input.metadata ?? {});
  const db = createDb(env.DB);
  const now = new Date().toISOString();

  let storedVectorId: string | null = null;
  try {
    const embedding = await embed(env, content);
    await env.MEMORY_INDEX.upsert([
      {
        id: vectorId,
        values: embedding,
        metadata: {
          kind: "memory",
          agent_id: scope.agent.id,
          owner_id: scope.ownerId,
          pid: scope.pid,
          tid: scope.tid ?? "",
        },
      },
    ]);
    storedVectorId = vectorId;
  } catch (err) {
    console.warn("vector_upsert_failed", err);
  }

  await db.insert(memories).values({
      id,
      organization_id: scope.ownerId,
      owner_id: scope.ownerId,
      subject_id: scope.subjectId,
      agent_id: scope.agent.id,
      namespace: scope.namespace,
      pid: scope.pid,
      tid: scope.tid,
      content,
      content_lower: content.toLowerCase(),
      metadata: metadataJson,
      vector_id: storedVectorId,
      created_at: now,
      updated_at: now,
    });

  let triples: KgTripleRow[] = [];
  if (input.extractKg !== false) {
    try {
      const extracted = await extractTriples(env, content);
      triples = await storeTriples({
        env,
        agentId: scope.agent.id,
        ownerId: scope.ownerId,
        pid: scope.pid,
        tid: scope.tid,
        sourceMemoryId: id,
        triples: extracted,
      });
    } catch (err) {
      console.warn("kg_extract_or_store_failed", err);
    }
  }

  const memory = await db.query.memories.findFirst({
    where: eq(memories.id, id),
  });
  if (!memory) throw new Error("Inserted memory could not be loaded");
  return { memory: memory satisfies MemoryRow, triples };
}

export async function listMemories(args: {
  db: D1Database;
  agentId: string;
  pid?: string | null;
  tid?: string | null;
  limit: number;
}): Promise<MemoryRow[]> {
  const db = createDb(args.db);
  const filters = [eq(memories.agent_id, args.agentId)];
  if (args.pid) filters.push(eq(memories.pid, args.pid));
  if (args.tid) filters.push(eq(memories.tid, args.tid));
  return db
    .select()
    .from(memories)
    .where(and(...filters))
    .orderBy(desc(memories.created_at))
    .limit(args.limit);
}

export async function deleteMemory(args: {
  env: Bindings;
  agentId: string;
  memoryId: string;
}): Promise<boolean> {
  const db = createDb(args.env.DB);
  const row = await db.query.memories.findFirst({
    where: and(eq(memories.id, args.memoryId), eq(memories.agent_id, args.agentId)),
    columns: { vector_id: true },
  });
  if (!row) return false;

  if (row.vector_id) {
    try {
      await args.env.MEMORY_INDEX.deleteByIds([row.vector_id]);
    } catch (err) {
      console.warn("vector_delete_failed", err);
    }
  }

  await db.delete(kgTriples).where(eq(kgTriples.source_memory_id, args.memoryId));
  await db
    .delete(memories)
    .where(and(eq(memories.id, args.memoryId), eq(memories.agent_id, args.agentId)));
  return true;
}
