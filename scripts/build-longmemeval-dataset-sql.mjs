import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = repoRoot();
const outDir = resolve(process.env.LME_SQL_OUT_DIR ?? resolve(root.pathname, "tmp/longmemeval-dataset"));
const sourceRoot = resolve(process.env.LME_SOURCE_DIR ?? resolve(root.pathname, "tmp/longmemeval-source"));
const lmeDir = resolve(process.env.LME_V1_SOURCE_DIR ?? resolve(sourceRoot, "lme"));
const lmeV2Dir = resolve(process.env.LME_V2_SOURCE_DIR ?? resolve(sourceRoot, "lme-v2"));
const chunkBytes = Number(process.env.LME_SQL_CHUNK_BYTES ?? 7_500_000);
const rawLimit = Number(process.env.LME_RAW_JSON_MAX_BYTES ?? 40_000);
const trajectoryStateLimit = Number(process.env.LME_V2_STATE_PREVIEW_LIMIT ?? 80);
const lmeVariants = (process.env.LME_VARIANTS ?? "oracle,s")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const lmeFiles = {
  oracle: {
    fileName: "longmemeval_oracle.json",
    url: "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json",
  },
  s: {
    fileName: "longmemeval_s_cleaned.json",
    url: "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json",
  },
  m: {
    fileName: "longmemeval_m_cleaned.json",
    url: "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_m_cleaned.json",
  },
};

const lmeV2Files = [
  {
    path: "questions.jsonl",
    url: "https://huggingface.co/datasets/xiaowu0162/longmemeval-v2/resolve/main/questions.jsonl",
  },
  {
    path: "haystacks/lme_v2_small.json",
    url: "https://huggingface.co/datasets/xiaowu0162/longmemeval-v2/resolve/main/haystacks/lme_v2_small.json",
  },
  {
    path: "haystacks/lme_v2_medium.json",
    url: "https://huggingface.co/datasets/xiaowu0162/longmemeval-v2/resolve/main/haystacks/lme_v2_medium.json",
  },
];

if (process.env.LME_V2_DOWNLOAD_TRAJECTORIES === "1") {
  lmeV2Files.push({
    path: "trajectories.jsonl",
    url: "https://huggingface.co/datasets/xiaowu0162/longmemeval-v2/resolve/main/trajectories.jsonl",
  });
}

async function ensureSources() {
  await mkdir(lmeDir, { recursive: true });
  await mkdir(resolve(lmeV2Dir, "haystacks"), { recursive: true });

  if (process.env.LME_SKIP_DOWNLOAD !== "1") {
    for (const variant of lmeVariants) {
      const spec = lmeFiles[variant];
      if (!spec) throw new Error(`Unknown LME variant: ${variant}`);
      await downloadIfMissing(spec.url, resolve(lmeDir, spec.fileName));
    }
    for (const spec of lmeV2Files) {
      await downloadIfMissing(spec.url, resolve(lmeV2Dir, spec.path));
    }
  }
}

async function importLme(writer, summary) {
  const selected = [];
  for (const variant of lmeVariants) {
    const spec = lmeFiles[variant];
    if (!spec) throw new Error(`Unknown LME variant: ${variant}`);
    const filePath = resolve(lmeDir, spec.fileName);
    if (!existsSync(filePath)) continue;
    selected.push({ variant, filePath });
  }

  await writer.write(
    `INSERT INTO lme_metadata (slug, name, version, source_path, raw_json_max_bytes) VALUES ('lme', 'LongMemEval', 'cleaned', ${q(
      selected.map((item) => item.filePath).join(","),
    )}, ${rawLimit});\n`,
  );

  for (const item of selected) {
    const before = summary.lme.questions;
    for await (const sample of readJsonArrayObjects(item.filePath)) {
      const questionId = String(sample.question_id ?? "");
      if (!questionId) continue;
      const sessionCount = Array.isArray(sample.haystack_sessions) ? sample.haystack_sessions.length : 0;
      const turnCount = countLmeTurns(sample);
      const raw = limitedJson(sample, rawLimit);
      await writer.write(
        `INSERT INTO lme_questions (id, variant, question_id, question_type, is_abstention, question, expected_answer, question_date, session_count, turn_count, answer_session_ids_json, haystack_session_ids_json, haystack_dates_json, raw_json, raw_json_truncated) VALUES (${q(
          `lme_${item.variant}_${questionId}`,
        )}, ${q(item.variant)}, ${q(questionId)}, ${qOrNull(sample.question_type)}, ${
          questionId.endsWith("_abs") ? 1 : 0
        }, ${q(String(sample.question ?? ""))}, ${q(stringify(sample.answer))}, ${qOrNull(
          sample.question_date,
        )}, ${sessionCount}, ${turnCount}, ${q(JSON.stringify(sample.answer_session_ids ?? []))}, ${q(
          JSON.stringify(sample.haystack_session_ids ?? []),
        )}, ${q(JSON.stringify(sample.haystack_dates ?? []))}, ${q(raw.value)}, ${raw.truncated ? 1 : 0});\n`,
      );
      await writeLmeSessions(writer, item.variant, questionId, sample);
      summary.lme.questions += 1;
      summary.lme.sessions += sessionCount;
      summary.lme.turns += turnCount;
    }
    summary.lme.variants.push({ variant: item.variant, questions: summary.lme.questions - before });
  }
}

async function writeLmeSessions(writer, variant, questionId, sample) {
  const sessions = Array.isArray(sample.haystack_sessions) ? sample.haystack_sessions : [];
  const sessionIds = Array.isArray(sample.haystack_session_ids) ? sample.haystack_session_ids : [];
  const dates = Array.isArray(sample.haystack_dates) ? sample.haystack_dates : [];
  const answerIds = new Set(Array.isArray(sample.answer_session_ids) ? sample.answer_session_ids.map(String) : []);

  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
    const session = Array.isArray(sessions[sessionIndex]) ? sessions[sessionIndex] : [];
    const sessionId = String(sessionIds[sessionIndex] ?? `${questionId}_${sessionIndex}`);
    const raw = limitedJson(session, rawLimit);
    await writer.write(
      `INSERT INTO lme_sessions (id, variant, question_id, session_index, session_id, session_date, is_answer_session, turn_count, raw_json, raw_json_truncated) VALUES (${q(
        `lme_${variant}_${questionId}_${sessionIndex}`,
      )}, ${q(variant)}, ${q(questionId)}, ${sessionIndex}, ${q(sessionId)}, ${qOrNull(dates[sessionIndex])}, ${
        answerIds.has(sessionId) ? 1 : 0
      }, ${session.length}, ${q(raw.value)}, ${raw.truncated ? 1 : 0});\n`,
    );

    for (let turnIndex = 0; turnIndex < session.length; turnIndex++) {
      const turn = session[turnIndex] && typeof session[turnIndex] === "object" ? session[turnIndex] : {};
      await writer.write(
        `INSERT INTO lme_turns (id, variant, question_id, session_index, turn_index, role, content, has_answer) VALUES (${q(
          `lme_${variant}_${questionId}_${sessionIndex}_${turnIndex}`,
        )}, ${q(variant)}, ${q(questionId)}, ${sessionIndex}, ${turnIndex}, ${qOrNull(turn.role)}, ${q(
          String(turn.content ?? ""),
        )}, ${turn.has_answer ? 1 : 0});\n`,
      );
    }
  }
}

async function importLmeV2(writer, summary) {
  const questionsPath = resolve(lmeV2Dir, "questions.jsonl");
  const smallPath = resolve(lmeV2Dir, "haystacks/lme_v2_small.json");
  const mediumPath = resolve(lmeV2Dir, "haystacks/lme_v2_medium.json");

  await writer.write(
    `INSERT INTO lme_v2_metadata (slug, name, version, questions_source_path, haystacks_source_path, trajectories_source_path, raw_json_max_bytes) VALUES ('lme_v2', 'LongMemEval-V2', 'public', ${q(
      questionsPath,
    )}, ${q(resolve(lmeV2Dir, "haystacks"))}, ${qOrNull(
      existsSync(resolve(lmeV2Dir, "trajectories.jsonl")) ? resolve(lmeV2Dir, "trajectories.jsonl") : null,
    )}, ${rawLimit});\n`,
  );

  const questionIds = new Set();
  for await (const row of readJsonl(questionsPath)) {
    const id = String(row.id ?? "");
    if (!id) continue;
    questionIds.add(id);
    const raw = limitedJson(row, rawLimit);
    await writer.write(
      `INSERT INTO lme_v2_questions (id, domain, environment, question_type, question, expected_answer, image_path, eval_function, raw_json, raw_json_truncated) VALUES (${q(
        id,
      )}, ${qOrNull(row.domain)}, ${qOrNull(row.environment)}, ${qOrNull(row.question_type)}, ${q(
        String(row.question ?? ""),
      )}, ${q(stringify(row.answer))}, ${qOrNull(row.image)}, ${qOrNull(row.eval_function)}, ${q(raw.value)}, ${
        raw.truncated ? 1 : 0
      });\n`,
    );
    summary.lme_v2.questions += 1;
  }

  for (const [tier, filePath] of [
    ["small", smallPath],
    ["medium", mediumPath],
  ]) {
    if (!existsSync(filePath)) continue;
    const payload = JSON.parse(await readFile(filePath, "utf8"));
    for (const [questionId, trajectoryIds] of Object.entries(payload)) {
      if (!questionIds.has(questionId) || !Array.isArray(trajectoryIds)) continue;
      await writer.write(
        `INSERT INTO lme_v2_haystacks (id, tier, question_id, trajectory_count, trajectory_ids_json) VALUES (${q(
          `lme_v2_${tier}_${questionId}`,
        )}, ${q(tier)}, ${q(questionId)}, ${trajectoryIds.length}, ${q(JSON.stringify(trajectoryIds))});\n`,
      );
      summary.lme_v2.haystackRows += 1;
    }
  }

  const trajectoriesPath = resolve(lmeV2Dir, "trajectories.jsonl");
  if (!existsSync(trajectoriesPath)) return;
  for await (const row of readJsonl(trajectoriesPath)) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const states = Array.isArray(row.states) ? row.states : [];
    const raw = limitedJson(row, rawLimit);
    await writer.write(
      `INSERT INTO lme_v2_trajectories (id, domain, environment, goal, outcome, start_url, state_count, raw_json, raw_json_truncated) VALUES (${q(
        id,
      )}, ${qOrNull(row.domain)}, ${qOrNull(row.environment)}, ${q(String(row.goal ?? ""))}, ${qOrNull(
        row.outcome,
      )}, ${qOrNull(row.start_url)}, ${states.length}, ${q(raw.value)}, ${raw.truncated ? 1 : 0});\n`,
    );
    summary.lme_v2.trajectories += 1;
    for (let index = 0; index < Math.min(states.length, trajectoryStateLimit); index++) {
      const state = states[index] && typeof states[index] === "object" ? states[index] : {};
      const preview = String(state.accessibility_tree ?? "").slice(0, 4000);
      await writer.write(
        `INSERT INTO lme_v2_states (id, trajectory_id, state_index, step, url, action, thought, accessibility_tree_preview, screenshot_path) VALUES (${q(
          `lme_v2_${id}_${index}`,
        )}, ${q(id)}, ${Number(state.state_index ?? index)}, ${numberOrNull(state.step)}, ${qOrNull(state.url)}, ${qOrNull(
          stringify(state.action),
        )}, ${qOrNull(state.thought)}, ${q(preview)}, ${qOrNull(state.screenshot)});\n`,
      );
      summary.lme_v2.states += 1;
    }
  }
}

function schemaSql() {
  return `
DROP TABLE IF EXISTS lme_v2_states;
DROP TABLE IF EXISTS lme_v2_trajectories;
DROP TABLE IF EXISTS lme_v2_haystacks;
DROP TABLE IF EXISTS lme_v2_questions;
DROP TABLE IF EXISTS lme_v2_metadata;
DROP TABLE IF EXISTS lme_turns;
DROP TABLE IF EXISTS lme_sessions;
DROP TABLE IF EXISTS lme_questions;
DROP TABLE IF EXISTS lme_metadata;

CREATE TABLE lme_metadata (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  source_path TEXT NOT NULL,
  raw_json_max_bytes INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE lme_questions (
  id TEXT PRIMARY KEY,
  variant TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_type TEXT,
  is_abstention INTEGER NOT NULL DEFAULT 0,
  question TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  question_date TEXT,
  session_count INTEGER NOT NULL,
  turn_count INTEGER NOT NULL,
  answer_session_ids_json TEXT NOT NULL DEFAULT '[]',
  haystack_session_ids_json TEXT NOT NULL DEFAULT '[]',
  haystack_dates_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL,
  raw_json_truncated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE lme_sessions (
  id TEXT PRIMARY KEY,
  variant TEXT NOT NULL,
  question_id TEXT NOT NULL,
  session_index INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  session_date TEXT,
  is_answer_session INTEGER NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  raw_json_truncated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE lme_turns (
  id TEXT PRIMARY KEY,
  variant TEXT NOT NULL,
  question_id TEXT NOT NULL,
  session_index INTEGER NOT NULL,
  turn_index INTEGER NOT NULL,
  role TEXT,
  content TEXT NOT NULL,
  has_answer INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE lme_v2_metadata (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  questions_source_path TEXT NOT NULL,
  haystacks_source_path TEXT NOT NULL,
  trajectories_source_path TEXT,
  raw_json_max_bytes INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE lme_v2_questions (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  environment TEXT NOT NULL,
  question_type TEXT NOT NULL,
  question TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  image_path TEXT,
  eval_function TEXT,
  raw_json TEXT NOT NULL,
  raw_json_truncated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE lme_v2_haystacks (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES lme_v2_questions(id) ON DELETE CASCADE,
  trajectory_count INTEGER NOT NULL,
  trajectory_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE lme_v2_trajectories (
  id TEXT PRIMARY KEY,
  domain TEXT,
  environment TEXT,
  goal TEXT NOT NULL,
  outcome TEXT,
  start_url TEXT,
  state_count INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  raw_json_truncated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE lme_v2_states (
  id TEXT PRIMARY KEY,
  trajectory_id TEXT NOT NULL REFERENCES lme_v2_trajectories(id) ON DELETE CASCADE,
  state_index INTEGER NOT NULL,
  step INTEGER,
  url TEXT,
  action TEXT,
  thought TEXT,
  accessibility_tree_preview TEXT,
  screenshot_path TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_lme_questions_variant_question
  ON lme_questions (variant, question_id);
CREATE INDEX idx_lme_questions_type
  ON lme_questions (variant, question_type);
CREATE INDEX idx_lme_sessions_question
  ON lme_sessions (variant, question_id, session_index);
CREATE INDEX idx_lme_turns_question
  ON lme_turns (variant, question_id, session_index, turn_index);
CREATE INDEX idx_lme_turns_answer
  ON lme_turns (variant, has_answer);
CREATE INDEX idx_lme_v2_questions_domain
  ON lme_v2_questions (domain, question_type);
CREATE INDEX idx_lme_v2_haystacks_tier
  ON lme_v2_haystacks (tier, question_id);
CREATE INDEX idx_lme_v2_trajectories_domain
  ON lme_v2_trajectories (domain, environment);
CREATE INDEX idx_lme_v2_states_trajectory
  ON lme_v2_states (trajectory_id, state_index);
`;
}

class SqlChunkWriter {
  constructor(directory, maxBytes) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.index = 0;
    this.bytes = 0;
    this.buffer = "";
  }

  async write(sql) {
    if (this.bytes > 0 && this.bytes + Buffer.byteLength(sql) > this.maxBytes) {
      await this.flush();
    }
    this.buffer += sql;
    this.bytes += Buffer.byteLength(sql);
    if (this.bytes >= this.maxBytes) await this.flush();
  }

  async flush() {
    if (!this.buffer) return;
    this.index += 1;
    await writeFile(resolve(this.directory, `${String(this.index).padStart(4, "0")}.sql`), this.buffer);
    this.buffer = "";
    this.bytes = 0;
  }

  async close() {
    await this.flush();
  }
}

async function* readJsonl(path) {
  const text = await readFile(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) yield JSON.parse(trimmed);
  }
}

async function* readJsonArrayObjects(path) {
  const rows = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(rows)) throw new Error(`Expected JSON array: ${path}`);
  for (const row of rows) yield row;
}

async function downloadIfMissing(url, outPath) {
  if (await isCompleteDataFile(outPath)) return;
  await mkdir(resolve(outPath, ".."), { recursive: true });
  const result = spawnSync("curl", ["-L", "--fail", "--retry", "5", "--retry-delay", "3", "-C", "-", "-o", outPath, url], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Failed to download ${basename(outPath)}`);
}

async function isCompleteDataFile(path) {
  if (!existsSync(path)) return false;
  const info = await stat(path);
  if (info.size === 0) return false;
  const handle = await import("node:fs/promises").then((fs) => fs.open(path, "r"));
  try {
    const length = Math.min(4096, info.size);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, info.size - length);
    const tail = buffer.toString("utf8").trimEnd();
    if (path.endsWith(".jsonl")) return tail.endsWith("}");
    if (path.endsWith(".json")) return tail.endsWith("}") || tail.endsWith("]");
    return true;
  } finally {
    await handle.close();
  }
}

function countLmeTurns(sample) {
  if (!Array.isArray(sample.haystack_sessions)) return 0;
  return sample.haystack_sessions.reduce((sum, session) => sum + (Array.isArray(session) ? session.length : 0), 0);
}

function limitedJson(value, maxBytes) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) <= maxBytes) return { value: text, truncated: false };
  return { value: JSON.stringify({ truncated: true, preview: text.slice(0, maxBytes) }), truncated: true };
}

function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function qOrNull(value) {
  if (value === undefined || value === null || value === "") return "NULL";
  return q(typeof value === "string" ? value : JSON.stringify(value));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "NULL";
}

function stringify(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function repoRoot() {
  return new URL("..", import.meta.url);
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await ensureSources();

  const writer = new SqlChunkWriter(outDir, chunkBytes);
  await writer.write(schemaSql());

  const summary = {
    outDir,
    chunks: 0,
    lme: {
      variants: [],
      questions: 0,
      sessions: 0,
      turns: 0,
    },
    lme_v2: {
      questions: 0,
      haystackRows: 0,
      trajectories: 0,
      states: 0,
      trajectoriesDownloaded: existsSync(resolve(lmeV2Dir, "trajectories.jsonl")),
    },
  };

  await importLme(writer, summary);
  await importLmeV2(writer, summary);
  await writer.close();
  summary.chunks = writer.index;
  await writeFile(resolve(outDir, "manifest.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

await main();
