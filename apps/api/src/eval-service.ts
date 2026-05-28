import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { createDb } from "./db/client";
import {
  evalDatasets,
  evalItems,
  evalResults,
  evalRunSecrets,
  evalRuns,
} from "./db/schema";
import { HttpError } from "./http";
import { newEvalResultId, newEvalRunId } from "./ids";
import type { Bindings, EvalQueueMessage } from "./types";

const LOCOMO_DATASET_ID = "evalds_locomo";
const LOCOMO_SLUG = "locomo";
// Each queue message carries a single item id. The consumer's
// max_batch_size is 1 so a single LLM round-trip never blocks the
// handler. Concurrency comes from the queue itself running messages in
// parallel across the worker fleet.
const QUEUE_TIMEOUT_MS_DEFAULT = 25_000;
const DEFAULT_JUDGE_MODEL = "@cf/meta/llama-3.1-8b-instruct";

type EvalMode = "full" | "batch" | "single";
type EvalStatus = "queued" | "running" | "completed" | "failed" | "partial";
type ResultStatus = "queued" | "running" | "completed" | "failed";

interface LocomoSample {
  sample_id: string;
  qa: Array<{
    question: string;
    answer: unknown;
    adversarial_answer?: unknown;
    evidence?: string[];
    category?: number;
  }>;
  conversation: Record<string, unknown>;
  event_summary?: unknown;
  observation?: unknown;
  session_summary?: unknown;
}

interface LocomoDatasetMetadata {
  slug: string;
  name: string;
  version: string;
  sample_count: number;
  question_count: number;
  persona_count?: number;
  prompt_example_count?: number;
  imported_at: string;
}

interface LocomoQuestionRow {
  id: string;
  sample_id: string;
  question_index: number;
  question: string;
  expected_answer: string;
  adversarial_answer: string | null;
  category: number | null;
  evidence_json: string;
}

interface LocomoSampleRow {
  sample_id: string;
  speaker_a: string;
  speaker_b: string;
  event_summary_json: string | null;
  observation_json: string | null;
  session_summary_json: string | null;
}

interface LocomoSessionDateRow {
  session_index: number;
  date_time: string;
}

interface LocomoTurnRow {
  session_index: number;
  turn_index: number;
  dia_id: string;
  speaker: string;
  text: string;
  image_urls_json: string;
  blip_caption: string | null;
  query: string | null;
}

interface LocomoPromptExampleRow {
  slug: string;
  payload_json: string;
}

interface EndpointConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface CreateEvalRunInput {
  ownerId: string;
  datasetSlug?: string;
  mode?: EvalMode;
  sampleIds?: string[];
  itemIds?: string[];
  limit?: number;
  offset?: number;
  categories?: number[];
  endpoint: EndpointConfig;
  judgeModel?: string;
  enqueue?: boolean;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface JudgePayload {
  score?: number;
  passed?: boolean;
  reason?: string;
}

export async function listEvalDatasets(env: Bindings) {
  await ensureLocomoEvalDataset(env);
  const db = createDb(env.DB);
  const datasets = await db.select().from(evalDatasets).orderBy(desc(evalDatasets.imported_at));
  return { datasets };
}

export async function listEvalItems(env: Bindings, datasetSlug: string, opts: {
  sampleId?: string | null;
  category?: number | null;
  limit: number;
  offset: number;
}) {
  const db = createDb(env.DB);
  const dataset = await getDatasetBySlug(env, datasetSlug);
  const filters = [eq(evalItems.dataset_id, dataset.id)];
  if (opts.sampleId) filters.push(eq(evalItems.sample_id, opts.sampleId));
  if (opts.category !== null && opts.category !== undefined) {
    filters.push(eq(evalItems.category, opts.category));
  }
  const items = await db
    .select()
    .from(evalItems)
    .where(and(...filters))
    .orderBy(asc(evalItems.sample_id), asc(evalItems.question_index))
    .limit(opts.limit)
    .offset(opts.offset);
  return { dataset, items };
}

export async function createEvalRun(env: Bindings, input: CreateEvalRunInput) {
  if ((input.datasetSlug ?? LOCOMO_SLUG) === LOCOMO_SLUG) {
    await ensureLocomoEvalDataset(env);
  }
  const endpoint = normalizeEndpoint(input.endpoint, "endpoint");
  const dataset = await getDatasetBySlug(env, input.datasetSlug ?? LOCOMO_SLUG);
  const itemRows = await selectRunItems(env, dataset.id, input);
  if (itemRows.length === 0) throw new HttpError(422, "No evaluation items matched the request");

  const now = new Date().toISOString();
  const id = newEvalRunId();
  const mode = input.mode ?? inferMode(input);
  const db = createDb(env.DB);

  await db.insert(evalRuns).values({
    id,
    owner_id: input.ownerId,
    dataset_id: dataset.id,
    mode,
    status: "queued" satisfies EvalStatus,
    endpoint_url: endpoint.baseUrl,
    endpoint_model: endpoint.model ?? "",
    judge_url: "workers-ai",
    judge_model: normalizeWorkersAiModel(input.judgeModel, env.KG_LLM_MODEL ?? DEFAULT_JUDGE_MODEL),
    total_items: itemRows.length,
    completed_items: 0,
    failed_items: 0,
    config: JSON.stringify({
      sampleIds: input.sampleIds ?? null,
      itemIds: input.itemIds ?? null,
      categories: input.categories ?? null,
      limit: input.limit ?? null,
      offset: input.offset ?? null,
      endpoint: publicEndpointConfig(endpoint),
      judge: {
        provider: "workers-ai",
        model: normalizeWorkersAiModel(input.judgeModel, env.KG_LLM_MODEL ?? DEFAULT_JUDGE_MODEL),
      },
    }),
    created_at: now,
    updated_at: now,
  });

  await db.insert(evalResults).values(
    itemRows.map((item) => ({
      id: newEvalResultId(),
      run_id: id,
      item_id: item.id,
      status: "queued" satisfies ResultStatus,
      created_at: now,
      updated_at: now,
    })),
  );

  await persistRunSecrets(env, id, endpoint);

  if (input.enqueue !== false) {
    await enqueueRun(env, id, itemRows.map((item) => item.id));
  }

  return { run: await getEvalRun(env, input.ownerId, id), queuedItems: itemRows.length };
}

async function persistRunSecrets(
  env: Bindings,
  runId: string,
  endpoint: EndpointConfig,
) {
  const payload = JSON.stringify(endpoint);
  const now = new Date().toISOString();
  const db = createDb(env.DB);
  await db
    .insert(evalRunSecrets)
    .values({ run_id: runId, payload, expires_at: now, created_at: now })
    .onConflictDoUpdate({
      target: evalRunSecrets.run_id,
      set: { payload, expires_at: now },
    });
}

async function loadEndpointSecrets(
  env: Bindings,
  runId: string,
): Promise<EndpointConfig | null> {
  const db = createDb(env.DB);
  const row = await db.query.evalRunSecrets.findFirst({
    where: eq(evalRunSecrets.run_id, runId),
  });
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as EndpointConfig;
  } catch (err) {
    console.warn("eval_secret_parse_failed", err);
    return null;
  }
}

async function purgeRunSecrets(env: Bindings, runId: string) {
  const db = createDb(env.DB);
  try {
    await db.delete(evalRunSecrets).where(eq(evalRunSecrets.run_id, runId));
  } catch (err) {
    console.warn("eval_secret_purge_failed", err);
  }
}

export async function getEvalRun(env: Bindings, ownerId: string, runId: string) {
  const db = createDb(env.DB);
  const run = await db.query.evalRuns.findFirst({
    where: and(eq(evalRuns.id, runId), eq(evalRuns.owner_id, ownerId)),
  });
  if (!run) throw new HttpError(404, "Evaluation run not found");
  const results = await db
    .select({
      id: evalResults.id,
      item_id: evalResults.item_id,
      status: evalResults.status,
      candidate_answer: evalResults.candidate_answer,
      judge_score: evalResults.judge_score,
      judge_passed: evalResults.judge_passed,
      judge_reason: evalResults.judge_reason,
      error: evalResults.error,
      duration_ms: evalResults.duration_ms,
      updated_at: evalResults.updated_at,
      question: evalItems.question,
      expected_answer: evalItems.expected_answer,
      sample_id: evalItems.sample_id,
      category: evalItems.category,
    })
    .from(evalResults)
    .innerJoin(evalItems, eq(evalResults.item_id, evalItems.id))
    .where(eq(evalResults.run_id, runId))
    .orderBy(asc(evalItems.sample_id), asc(evalItems.question_index))
    .limit(500);
  return { run, results };
}

export async function listEvalRuns(env: Bindings, ownerId: string, limit: number) {
  const db = createDb(env.DB);
  const runs = await db
    .select()
    .from(evalRuns)
    .where(eq(evalRuns.owner_id, ownerId))
    .orderBy(desc(evalRuns.created_at))
    .limit(limit);
  return { runs };
}

export async function processEvalQueue(env: Bindings, message: EvalQueueMessage) {
  const db = createDb(env.DB);
  const run = await db.query.evalRuns.findFirst({
    where: eq(evalRuns.id, message.runId),
  });
  if (!run) return;

  const endpoint = await loadEndpointSecrets(env, message.runId);
  if (!endpoint) {
    // Mark queued/in-flight rows for this batch as failed so the run
    // stats reflect reality instead of getting stuck on "running".
    await markBatchFailed(
      env,
      message.runId,
      message.itemIds,
      "Endpoint secrets missing",
    );
    await refreshRunStats(env, run.id);
    return;
  }

  const resultRows = await db
    .select({ result: evalResults, item: evalItems })
    .from(evalResults)
    .innerJoin(evalItems, eq(evalResults.item_id, evalItems.id))
    .where(
      and(
        eq(evalResults.run_id, message.runId),
        inArray(evalResults.item_id, message.itemIds),
      ),
    );

  await db
    .update(evalRuns)
    .set({ status: "running" satisfies EvalStatus, updated_at: new Date().toISOString() })
    .where(eq(evalRuns.id, message.runId));

  // Run all items in the batch in parallel — at most a few items per
  // queue invocation so we don't fan out unbounded.
  await Promise.all(
    resultRows
      .filter((row) => row.result.status !== "completed")
      .map((row) =>
        evaluateOne(
          env,
          endpoint,
          run.judge_model || env.KG_LLM_MODEL || DEFAULT_JUDGE_MODEL,
          row.result.id,
          row.item,
        ),
      ),
  );

  await refreshRunStats(env, run.id);

  const completedRun = await db.query.evalRuns.findFirst({
    where: eq(evalRuns.id, message.runId),
    columns: { status: true },
  });
  if (
    completedRun?.status === "completed" ||
    completedRun?.status === "failed" ||
    completedRun?.status === "partial"
  ) {
    await purgeRunSecrets(env, message.runId);
  }
}

async function markBatchFailed(
  env: Bindings,
  runId: string,
  itemIds: string[],
  reason: string,
) {
  const db = createDb(env.DB);
  const now = new Date().toISOString();
  await db
    .update(evalResults)
    .set({
      status: "failed" satisfies ResultStatus,
      error: reason,
      updated_at: now,
    })
    .where(
      and(
        eq(evalResults.run_id, runId),
        inArray(evalResults.item_id, itemIds),
      ),
    );
}

async function evaluateOne(
  env: Bindings,
  endpoint: EndpointConfig,
  judgeModel: string,
  resultId: string,
  item: typeof evalItems.$inferSelect,
) {
  const db = createDb(env.DB);
  const started = Date.now();
  const now = new Date().toISOString();
  await db
    .update(evalResults)
    .set({ status: "running" satisfies ResultStatus, updated_at: now })
    .where(eq(evalResults.id, resultId));

  try {
    const sample = await loadEvalSample(env, item);
    const promptExamples = await loadLocomoPromptExamples(env);
    const candidateAnswer = await callChatCompletion(
      endpoint,
      buildCandidateMessages(sample, item, promptExamples),
    );
    const judgePayload = await callJudge(env, item, candidateAnswer, judgeModel);
    const finished = new Date().toISOString();
    await db
      .update(evalResults)
      .set({
        status: "completed" satisfies ResultStatus,
        candidate_answer: candidateAnswer,
        judge_score: judgePayload.score ?? null,
        judge_passed: judgePayload.passed ?? null,
        judge_reason: judgePayload.reason ?? "",
        error: null,
        duration_ms: Date.now() - started,
        updated_at: finished,
      })
      .where(eq(evalResults.id, resultId));
  } catch (err) {
    await db
      .update(evalResults)
      .set({
        status: "failed" satisfies ResultStatus,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - started,
        updated_at: new Date().toISOString(),
      })
      .where(eq(evalResults.id, resultId));
  }
}

async function refreshRunStats(env: Bindings, runId: string) {
  const db = createDb(env.DB);
  const rows = await db
    .select({
      status: evalResults.status,
      score: evalResults.judge_score,
    })
    .from(evalResults)
    .where(eq(evalResults.run_id, runId));
  const completed = rows.filter((row) => row.status === "completed");
  const failed = rows.filter((row) => row.status === "failed");
  const finished = completed.length + failed.length;
  const total = rows.length;
  const scored = completed.filter((row) => typeof row.score === "number");
  const averageScore =
    scored.length > 0
      ? scored.reduce((sum, row) => sum + Number(row.score), 0) / scored.length
      : null;
  const status: EvalStatus =
    finished < total ? "running" : failed.length > 0 && completed.length > 0 ? "partial" : failed.length === total ? "failed" : "completed";

  await db
    .update(evalRuns)
    .set({
      status,
      completed_items: completed.length,
      failed_items: failed.length,
      average_score: averageScore,
      updated_at: new Date().toISOString(),
      completed_at: finished === total ? new Date().toISOString() : null,
    })
    .where(eq(evalRuns.id, runId));
}

async function enqueueRun(env: Bindings, runId: string, itemIds: string[]) {
  // One item per message. Cloudflare Queues will run messages in
  // parallel across the worker fleet, and the consumer's batch size of
  // 1 keeps any single LLM round-trip well under the handler budget.
  const messages = itemIds.map((itemId) => ({
    body: { runId, itemIds: [itemId] } satisfies EvalQueueMessage,
  }));
  for (let index = 0; index < messages.length; index += 100) {
    await env.EVAL_QUEUE.sendBatch(messages.slice(index, index + 100));
  }
}

async function selectRunItems(
  env: Bindings,
  datasetId: string,
  input: CreateEvalRunInput,
): Promise<Array<typeof evalItems.$inferSelect>> {
  const db = createDb(env.DB);
  if (input.itemIds?.length) {
    return db
      .select()
      .from(evalItems)
      .where(and(eq(evalItems.dataset_id, datasetId), inArray(evalItems.id, input.itemIds)))
      .orderBy(asc(evalItems.sample_id), asc(evalItems.question_index));
  }

  const filters = [eq(evalItems.dataset_id, datasetId)];
  if (input.sampleIds?.length) filters.push(inArray(evalItems.sample_id, input.sampleIds));
  if (input.categories?.length) filters.push(inArray(evalItems.category, input.categories));

  return db
    .select()
    .from(evalItems)
    .where(and(...filters))
    .orderBy(asc(evalItems.sample_id), asc(evalItems.question_index))
    .limit(Math.min(2000, Math.max(1, input.limit ?? (input.mode === "single" ? 1 : 2000))))
    .offset(Math.max(0, input.offset ?? 0));
}

async function getDatasetBySlug(env: Bindings, slug: string) {
  if (slug === LOCOMO_SLUG) {
    await ensureLocomoEvalDataset(env);
  }
  const db = createDb(env.DB);
  const dataset = await db.query.evalDatasets.findFirst({
    where: eq(evalDatasets.slug, slug),
  });
  if (!dataset) throw new HttpError(404, `Dataset '${slug}' is not imported`);
  return dataset;
}

async function ensureLocomoEvalDataset(env: Bindings) {
  const db = createDb(env.DB);
  const metadata = await env.BENCHMARK_DATASET_DB
    .prepare("select * from locomo_metadata where slug = ?")
    .bind(LOCOMO_SLUG)
    .first<LocomoDatasetMetadata>();
  if (!metadata) throw new HttpError(404, "LoCoMo benchmark dataset is not available");

  const existing = await db.query.evalDatasets.findFirst({
    where: eq(evalDatasets.slug, LOCOMO_SLUG),
  });
  const metadataJson = JSON.stringify({
    source: "benchmark_d1",
    importedAt: metadata.imported_at,
    personaCount: metadata.persona_count ?? 0,
    promptExampleCount: metadata.prompt_example_count ?? 0,
  });

  if (
    existing &&
    existing.sample_count === metadata.sample_count &&
    existing.question_count === metadata.question_count &&
    existing.metadata === metadataJson
  ) {
    return existing;
  }

  const now = new Date().toISOString();
  const questionRows = await readAllLocomoQuestions(env);
  const statements: unknown[] = [
    db
      .insert(evalDatasets)
      .values({
        id: LOCOMO_DATASET_ID,
        slug: LOCOMO_SLUG,
        name: metadata.name,
        version: metadata.version,
        storage_key: "d1://memost-std-benchmark-dataset/locomo",
        sample_count: metadata.sample_count,
        question_count: metadata.question_count,
        metadata: metadataJson,
        imported_at: metadata.imported_at,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: evalDatasets.slug,
        set: {
          name: metadata.name,
          version: metadata.version,
          storage_key: "d1://memost-std-benchmark-dataset/locomo",
          sample_count: metadata.sample_count,
          question_count: metadata.question_count,
          metadata: metadataJson,
          updated_at: now,
        },
      }),
    db.delete(evalItems).where(eq(evalItems.dataset_id, LOCOMO_DATASET_ID)),
  ];

  const itemRows = questionRows.map((row) => ({
    id: row.id,
    dataset_id: LOCOMO_DATASET_ID,
    sample_id: row.sample_id,
    question_index: row.question_index,
    question: row.question,
    expected_answer: row.expected_answer,
    category: row.category,
    evidence: row.evidence_json,
    sample_storage_key: `d1://locomo_samples/${row.sample_id}`,
    metadata: JSON.stringify({
      dataset: LOCOMO_SLUG,
      benchmarkQuestionId: row.id,
      adversarialAnswer: row.adversarial_answer,
    }),
    created_at: now,
  }));
  for (let index = 0; index < itemRows.length; index += 100) {
    statements.push(db.insert(evalItems).values(itemRows.slice(index, index + 100)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.batch(statements as any);
  return db.query.evalDatasets.findFirst({ where: eq(evalDatasets.slug, LOCOMO_SLUG) });
}

async function readAllLocomoQuestions(env: Bindings) {
  const rows: LocomoQuestionRow[] = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = await env.BENCHMARK_DATASET_DB
      .prepare(
        `select id, sample_id, question_index, question, expected_answer,
          adversarial_answer, category, evidence_json
        from locomo_questions
        order by sample_id, question_index
        limit ? offset ?`,
      )
      .bind(limit, offset)
      .all<LocomoQuestionRow>();
    rows.push(...(page.results ?? []));
    if ((page.results?.length ?? 0) < limit) break;
  }
  return rows;
}

async function loadEvalSample(env: Bindings, item: typeof evalItems.$inferSelect): Promise<LocomoSample> {
  if (!item.sample_storage_key.startsWith("d1://")) {
    throw new Error(`Unsupported evaluation sample storage: ${item.sample_storage_key}`);
  }
  return loadLocomoSampleFromBenchmarkDb(env, item.sample_id);
}

async function loadLocomoSampleFromBenchmarkDb(env: Bindings, sampleId: string): Promise<LocomoSample> {
  const [sample, dates, turns, questions] = await Promise.all([
    env.BENCHMARK_DATASET_DB
      .prepare("select * from locomo_samples where sample_id = ?")
      .bind(sampleId)
      .first<LocomoSampleRow>(),
    env.BENCHMARK_DATASET_DB
      .prepare(
        "select session_index, date_time from locomo_session_dates where sample_id = ? order by session_index",
      )
      .bind(sampleId)
      .all<LocomoSessionDateRow>(),
    env.BENCHMARK_DATASET_DB
      .prepare(
        `select session_index, turn_index, dia_id, speaker, text, image_urls_json, blip_caption, query
        from locomo_dialogue_turns
        where sample_id = ?
        order by session_index, turn_index`,
      )
      .bind(sampleId)
      .all<LocomoTurnRow>(),
    env.BENCHMARK_DATASET_DB
      .prepare(
        `select id, sample_id, question_index, question, expected_answer,
          adversarial_answer, category, evidence_json
        from locomo_questions
        where sample_id = ?
        order by question_index`,
      )
      .bind(sampleId)
      .all<LocomoQuestionRow>(),
  ]);
  if (!sample) throw new Error(`Missing benchmark sample: ${sampleId}`);

  const conversation: Record<string, unknown> = {
    speaker_a: sample.speaker_a,
    speaker_b: sample.speaker_b,
  };
  for (const row of dates.results ?? []) {
    conversation[`session_${row.session_index}_date_time`] = row.date_time;
  }
  for (const row of turns.results ?? []) {
    const key = `session_${row.session_index}`;
    if (!Array.isArray(conversation[key])) conversation[key] = [];
    (conversation[key] as unknown[]).push({
      dia_id: row.dia_id,
      speaker: row.speaker,
      text: row.text,
      img_url: parseJson<string[]>(row.image_urls_json),
      blip_caption: row.blip_caption,
      query: row.query,
    });
  }

  return {
    sample_id: sample.sample_id,
    conversation,
    event_summary: parseNullableJson(sample.event_summary_json),
    observation: parseNullableJson(sample.observation_json),
    session_summary: parseNullableJson(sample.session_summary_json),
    qa: (questions.results ?? []).map((row) => ({
      question: row.question,
      answer: row.expected_answer,
      adversarial_answer: row.adversarial_answer ?? undefined,
      category: row.category ?? undefined,
      evidence: parseJson<string[]>(row.evidence_json),
    })),
  };
}

function normalizeEndpoint(endpoint: EndpointConfig | undefined, label: string): EndpointConfig {
  if (!endpoint?.baseUrl?.trim()) throw new HttpError(422, `${label}.baseUrl is required`);
  if (!endpoint.apiKey?.trim()) throw new HttpError(422, `${label}.apiKey is required`);
  return {
    baseUrl: endpoint.baseUrl.replace(/\/$/, ""),
    apiKey: endpoint.apiKey,
    model: endpoint.model?.trim() || undefined,
    headers: endpoint.headers,
    timeoutMs: endpoint.timeoutMs,
  };
}


function publicEndpointConfig(endpoint: EndpointConfig) {
  return {
    baseUrl: endpoint.baseUrl,
    model: endpoint.model ?? null,
    timeoutMs: endpoint.timeoutMs ?? null,
    hasApiKey: Boolean(endpoint.apiKey),
    headerNames: Object.keys(endpoint.headers ?? {}),
  };
}

function inferMode(input: CreateEvalRunInput): EvalMode {
  if (input.itemIds?.length === 1 || input.limit === 1) return "single";
  if (input.limit || input.sampleIds?.length || input.categories?.length || input.itemIds?.length) return "batch";
  return "full";
}

function normalizeWorkersAiModel(value: string | undefined, fallback: string) {
  const model = value?.trim() || fallback;
  return model.startsWith("@cf/") ? model : fallback;
}

async function loadLocomoPromptExamples(env: Bindings) {
  const rows = await env.BENCHMARK_DATASET_DB
    .prepare(
      `select slug, payload_json
      from locomo_prompt_examples
      where slug in ('chatgpt_instructions', 'remove_context_examples')
      order by slug`,
    )
    .all<LocomoPromptExampleRow>();
  const out: Record<string, unknown> = {};
  for (const row of rows.results ?? []) {
    out[row.slug] = parseJson<unknown>(row.payload_json);
  }
  return out;
}

function buildCandidateMessages(
  sample: LocomoSample,
  item: typeof evalItems.$inferSelect,
  promptExamples: Record<string, unknown>,
): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Answer the user's question using only the supplied LoCoMo long conversation. Return a concise answer without extra commentary.",
    },
    {
      role: "user",
      content: JSON.stringify({
        sample_id: sample.sample_id,
        conversation: sample.conversation,
        observations: sample.observation ?? null,
        session_summary: sample.session_summary ?? null,
        prompt_examples: promptExamples,
        question: item.question,
        category: item.category,
        evidence: parseJson<string[]>(item.evidence),
      }),
    },
  ];
}

async function callJudge(
  env: Bindings,
  item: typeof evalItems.$inferSelect,
  candidateAnswer: string,
  judgeModel: string,
): Promise<JudgePayload> {
  const userContent = JSON.stringify({
    question: item.question,
    expected_answer: item.expected_answer,
    candidate_answer: candidateAnswer,
    evidence: parseJson<string[]>(item.evidence),
    category: item.category,
  });
  const model = normalizeWorkersAiModel(judgeModel, env.KG_LLM_MODEL ?? DEFAULT_JUDGE_MODEL);
  let raw: string;
  try {
    const out = (await env.AI.run(model as never, {
      messages: [
        {
          role: "system",
          content:
            "You are grading a long-context QA benchmark. Return strict JSON only with keys score (0 to 1), passed (boolean), and reason (short string). Score semantic equivalence against the expected answer.",
        },
        { role: "user", content: userContent },
      ],
      max_tokens: 256,
      temperature: 0,
    } as never)) as unknown as { response?: string; result?: string };
    raw = (out.response ?? out.result ?? "").trim();
  } catch (err) {
    console.warn("judge_ai_run_failed", err);
    return { score: 0, passed: false, reason: "Judge call failed" };
  }
  return parseJudgeJson(raw);
}

async function callChatCompletion(endpoint: EndpointConfig, messages: ChatMessage[]): Promise<string> {
  const url = `${endpoint.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    endpoint.timeoutMs ?? QUEUE_TIMEOUT_MS_DEFAULT,
  );
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${endpoint.apiKey}`,
        ...(endpoint.headers ?? {}),
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages,
        temperature: 0,
      }),
    });
    if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as ChatResponse;
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("LLM returned an empty answer");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJudgeJson(content: string): JudgePayload {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const payload = parseJson<JudgePayload>(cleaned);
  const score = Number(payload.score);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
    passed: Boolean(payload.passed ?? score >= 0.5),
    reason: String(payload.reason ?? ""),
  };
}

function parseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

function parseNullableJson(value: string | null): unknown {
  if (!value) return undefined;
  return parseJson<unknown>(value);
}

export async function countEvalItems(env: Bindings, datasetSlug = LOCOMO_SLUG) {
  const dataset = await getDatasetBySlug(env, datasetSlug);
  const db = createDb(env.DB);
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(evalItems)
    .where(eq(evalItems.dataset_id, dataset.id));
  return Number(rows[0]?.count ?? 0);
}
