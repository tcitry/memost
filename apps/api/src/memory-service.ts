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
  // Optional Worker execution context; when supplied, KG extraction
  // runs off the request path via waitUntil so the caller is not held
  // up by the LLM round-trip. The resulting triples will appear in
  // the next /v1/memories or search call.
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface AddMemoryResult {
  memory: MemoryRow;
  // Empty when KG extraction was deferred via `waitUntil`. Caller can
  // treat this as "pending"; SDK consumers that need the triples
  // synchronously can omit waitUntil to fall back to inline extraction.
  triples: KgTripleRow[];
  kgPending: boolean;
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

  // Embed once up front. We need the embedding before the vector
  // upsert; the D1 row insert has no such dependency, so we can run
  // both in parallel afterwards.
  let embedding: number[] | null = null;
  try {
    embedding = await embed(env, content);
  } catch (err) {
    console.warn("memory_embed_failed", err);
  }

  const upsertPromise = embedding
    ? env.MEMORY_INDEX.upsert([
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
      ]).catch((err) => {
        console.warn("vector_upsert_failed", err);
        return null;
      })
    : Promise.resolve(null);

  const insertPromise = db.insert(memories).values({
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
    vector_id: embedding ? vectorId : null,
    created_at: now,
    updated_at: now,
  });

  await Promise.all([upsertPromise, insertPromise]);

  // KG path is opt-out (default on) and offloaded when a waitUntil
  // hook is supplied. Failures are swallowed because they do not
  // affect the durability of the memory itself.
  const wantKg = input.extractKg !== false;
  let triples: KgTripleRow[] = [];
  let kgPending = false;

  if (wantKg) {
    const kgWork = (async () => {
      try {
        const extracted = await extractTriples(env, content);
        if (extracted.length === 0) return [] as KgTripleRow[];
        return await storeTriples({
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
        return [] as KgTripleRow[];
      }
    })();

    if (input.waitUntil) {
      input.waitUntil(kgWork);
      kgPending = true;
    } else {
      triples = await kgWork;
    }
  }

  const memory = await db.query.memories.findFirst({
    where: eq(memories.id, id),
  });
  if (!memory) throw new Error("Inserted memory could not be loaded");
  return { memory: memory satisfies MemoryRow, triples, kgPending };
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

  // Collect every vector id we need to remove from the index before
  // deleting the rows so a partial failure on D1 doesn't strand
  // vectors. Includes the memory itself and every KG triple sourced
  // from it.
  const tripleVectorRows = await db
    .select({ vector_id: kgTriples.vector_id })
    .from(kgTriples)
    .where(eq(kgTriples.source_memory_id, args.memoryId));
  const vectorIds = [
    ...(row.vector_id ? [row.vector_id] : []),
    ...tripleVectorRows
      .map((t) => t.vector_id)
      .filter((id): id is string => Boolean(id)),
  ];

  if (vectorIds.length > 0) {
    try {
      await args.env.MEMORY_INDEX.deleteByIds(vectorIds);
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

// Cascading delete used when an agent is removed. D1 doesn't enforce
// foreign keys by default, so we walk the dependent tables explicitly
// and clean up Vectorize entries in the same pass. Ownership is
// validated by the calling route handler.
export async function deleteAgentCascade(args: {
  env: Bindings;
  agentId: string;
}): Promise<void> {
  const db = createDb(args.env.DB);
  const memoryRows = await db
    .select({ vector_id: memories.vector_id })
    .from(memories)
    .where(eq(memories.agent_id, args.agentId));
  const tripleRows = await db
    .select({ vector_id: kgTriples.vector_id })
    .from(kgTriples)
    .where(eq(kgTriples.agent_id, args.agentId));

  const vectorIds = [
    ...memoryRows.map((row) => row.vector_id),
    ...tripleRows.map((row) => row.vector_id),
  ].filter((id): id is string => Boolean(id));

  if (vectorIds.length > 0) {
    try {
      await args.env.MEMORY_INDEX.deleteByIds(vectorIds);
    } catch (err) {
      console.warn("vector_delete_failed_cascade", err);
    }
  }

  await db.delete(kgTriples).where(eq(kgTriples.agent_id, args.agentId));
  await db.delete(memories).where(eq(memories.agent_id, args.agentId));
}
