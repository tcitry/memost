import { HttpError } from "./http";
import type {
  CreateMemoryInput,
  MemoryRecord,
  MemoryResponse,
  SearchMemoryInput,
} from "./types";

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 25;
const DEFAULT_SEARCH_LIMIT = 10;

export function normalizeMemory(row: MemoryRecord): MemoryResponse {
  return {
    ...row,
    metadata: parseMetadata(row.metadata),
  };
}

export function validateCreateMemory(input: CreateMemoryInput) {
  if (!input.organizationId?.trim()) {
    throw new HttpError(422, "organizationId is required");
  }

  if (!input.subjectId?.trim()) {
    throw new HttpError(422, "subjectId is required");
  }

  if (!input.agentId?.trim()) {
    throw new HttpError(422, "agentId is required");
  }

  if (!input.namespace?.trim()) {
    throw new HttpError(422, "namespace is required");
  }

  if (!input.content?.trim()) {
    throw new HttpError(422, "content is required");
  }

  if (input.embedding && !isNumberArray(input.embedding)) {
    throw new HttpError(422, "embedding must be an array of numbers");
  }
}

export function validateSearch(input: SearchMemoryInput) {
  if (!input.organizationId?.trim()) {
    throw new HttpError(422, "organizationId is required");
  }

  if (input.queryEmbedding && !isNumberArray(input.queryEmbedding)) {
    throw new HttpError(422, "queryEmbedding must be an array of numbers");
  }
}

export function getLimit(value: string | number | undefined, fallback = DEFAULT_LIST_LIMIT) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.trunc(parsed), MAX_LIST_LIMIT);
}

export async function listMemories(
  db: D1Database,
  organizationId: string,
  namespace: string | undefined,
  limit: number,
) {
  const query = namespace
    ? db
        .prepare(
          `SELECT * FROM memories
           WHERE organization_id = ? AND namespace = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .bind(organizationId, namespace, limit)
    : db
        .prepare(
          `SELECT * FROM memories
           WHERE organization_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .bind(organizationId, limit);

  const result = await query.all<MemoryRecord>();
  return (result.results ?? []).map(normalizeMemory);
}

export async function createMemory(
  env: Env,
  input: CreateMemoryInput,
  ctx: Pick<ExecutionContext, "waitUntil">,
) {
  validateCreateMemory(input);

  const id = crypto.randomUUID();
  const vectorId = input.embedding ? `mem_${id}` : null;
  const now = new Date().toISOString();
  const metadata = JSON.stringify(input.metadata ?? {});

  await env.DB.prepare(
    `INSERT INTO memories (
      id,
      organization_id,
      subject_id,
      agent_id,
      namespace,
      content,
      metadata,
      vector_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.organizationId,
      input.subjectId,
      input.agentId,
      input.namespace,
      input.content,
      metadata,
      vectorId,
      now,
      now,
    )
    .run();

  if (input.embedding && vectorId) {
    ctx.waitUntil(
      env.MEMORY_INDEX.upsert([
        {
          id: vectorId,
          values: input.embedding,
          metadata: {
            memoryId: id,
            organizationId: input.organizationId,
            subjectId: input.subjectId,
            agentId: input.agentId,
            namespace: input.namespace,
          },
        },
      ]),
    );
  }

  return getMemory(env.DB, id);
}

export async function getMemory(db: D1Database, id: string) {
  const row = await db
    .prepare("SELECT * FROM memories WHERE id = ?")
    .bind(id)
    .first<MemoryRecord>();

  if (!row) {
    throw new HttpError(404, "Memory not found");
  }

  return normalizeMemory(row);
}

export async function searchMemories(env: Env, input: SearchMemoryInput) {
  validateSearch(input);

  if (!input.queryEmbedding) {
    const memories = await listMemories(
      env.DB,
      input.organizationId,
      input.namespace,
      getLimit(input.limit, DEFAULT_SEARCH_LIMIT),
    );

    return {
      mode: "d1",
      matches: memories.map((memory) => ({ score: null, memory })),
    };
  }

  const matches = await env.MEMORY_INDEX.query(input.queryEmbedding, {
    topK: getLimit(input.limit, DEFAULT_SEARCH_LIMIT),
    returnMetadata: true,
    filter: input.namespace
      ? {
          organizationId: input.organizationId,
          namespace: input.namespace,
        }
      : {
          organizationId: input.organizationId,
        },
  });

  const ids = matches.matches
    .map((match) => match.metadata?.memoryId)
    .filter((memoryId): memoryId is string => typeof memoryId === "string");

  if (ids.length === 0) {
    return { mode: "vectorize", matches: [] };
  }

  const placeholders = ids.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT * FROM memories WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<MemoryRecord>();
  const byId = new Map((result.results ?? []).map((row) => [row.id, row]));

  return {
    mode: "vectorize",
    matches: matches.matches.flatMap((match) => {
      const memoryId = match.metadata?.memoryId;
      const row = typeof memoryId === "string" ? byId.get(memoryId) : undefined;

      return row ? [{ score: match.score, memory: normalizeMemory(row) }] : [];
    }),
  };
}

function parseMetadata(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isFinite(item));
}
