import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = repoRoot();
const inputPath = resolve(
  process.env.LOCOMO_DATA_PATH ?? "/Users/yindongliang/cloudsway/locomo/data/locomo10.json",
);
const personasPath = resolve(
  process.env.LOCOMO_PERSONAS_PATH ?? "/Users/yindongliang/cloudsway/locomo/data/msc_personas_all.json",
);
const promptExamplesDir = resolve(
  process.env.LOCOMO_PROMPT_EXAMPLES_DIR ?? "/Users/yindongliang/cloudsway/locomo/prompt_examples",
);
const outDir = process.env.LOCOMO_SQL_OUT_DIR
  ? resolve(process.env.LOCOMO_SQL_OUT_DIR)
  : resolve(root.pathname, "tmp/locomo-dataset");
const outFile = resolve(outDir, "import.sql");

const samples = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(samples)) throw new Error("LoCoMo JSON must be an array");
const personas = JSON.parse(await readFile(personasPath, "utf8"));
const promptExamples = await readPromptExamples(promptExamplesDir);

const questionCount = samples.reduce((sum, sample) => sum + assertSample(sample).qa.length, 0);
const personaCount = Object.values(personas).reduce(
  (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
  0,
);
let sql = "";

sql += `DROP TABLE IF EXISTS locomo_prompt_examples;\n`;
sql += `DROP TABLE IF EXISTS locomo_msc_personas;\n`;
sql += `DROP TABLE IF EXISTS locomo_questions;\n`;
sql += `DROP TABLE IF EXISTS locomo_dialogue_turns;\n`;
sql += `DROP TABLE IF EXISTS locomo_session_summaries;\n`;
sql += `DROP TABLE IF EXISTS locomo_session_dates;\n`;
sql += `DROP TABLE IF EXISTS locomo_samples;\n`;
sql += `DROP TABLE IF EXISTS locomo_metadata;\n`;

sql += `
CREATE TABLE locomo_metadata (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  sample_count INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  persona_count INTEGER NOT NULL DEFAULT 0,
  prompt_example_count INTEGER NOT NULL DEFAULT 0,
  source_path TEXT NOT NULL,
  personas_source_path TEXT,
  prompt_examples_source_path TEXT,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE locomo_samples (
  sample_id TEXT PRIMARY KEY,
  speaker_a TEXT NOT NULL,
  speaker_b TEXT NOT NULL,
  event_summary_json TEXT,
  observation_json TEXT,
  session_summary_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE locomo_session_dates (
  id TEXT PRIMARY KEY,
  sample_id TEXT NOT NULL REFERENCES locomo_samples(sample_id) ON DELETE CASCADE,
  session_index INTEGER NOT NULL,
  date_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE locomo_session_summaries (
  id TEXT PRIMARY KEY,
  sample_id TEXT NOT NULL REFERENCES locomo_samples(sample_id) ON DELETE CASCADE,
  session_index INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE locomo_dialogue_turns (
  id TEXT PRIMARY KEY,
  sample_id TEXT NOT NULL REFERENCES locomo_samples(sample_id) ON DELETE CASCADE,
  session_index INTEGER NOT NULL,
  turn_index INTEGER NOT NULL,
  dia_id TEXT NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  image_urls_json TEXT NOT NULL DEFAULT '[]',
  blip_caption TEXT,
  query TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE locomo_questions (
  id TEXT PRIMARY KEY,
  sample_id TEXT NOT NULL REFERENCES locomo_samples(sample_id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  adversarial_answer TEXT,
  category INTEGER,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE locomo_msc_personas (
  id TEXT PRIMARY KEY,
  split TEXT NOT NULL,
  split_index INTEGER NOT NULL,
  speaker_1_json TEXT NOT NULL DEFAULT '[]',
  speaker_2_json TEXT NOT NULL DEFAULT '[]',
  in_dataset INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE locomo_prompt_examples (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  top_level_type TEXT NOT NULL,
  example_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_locomo_questions_sample_question
  ON locomo_questions (sample_id, question_index);

CREATE INDEX idx_locomo_questions_category
  ON locomo_questions (category, sample_id, question_index);

CREATE INDEX idx_locomo_dialogue_turns_sample_session
  ON locomo_dialogue_turns (sample_id, session_index, turn_index);

CREATE INDEX idx_locomo_dialogue_turns_dia
  ON locomo_dialogue_turns (sample_id, dia_id);

CREATE INDEX idx_locomo_session_dates_sample
  ON locomo_session_dates (sample_id, session_index);

CREATE INDEX idx_locomo_session_summaries_sample
  ON locomo_session_summaries (sample_id, session_index);

CREATE UNIQUE INDEX idx_locomo_msc_personas_split_index
  ON locomo_msc_personas (split, split_index);

CREATE UNIQUE INDEX idx_locomo_prompt_examples_slug
  ON locomo_prompt_examples (slug);
`;

sql += `INSERT INTO locomo_metadata (slug, name, version, sample_count, question_count, persona_count, prompt_example_count, source_path, personas_source_path, prompt_examples_source_path) VALUES ('locomo', 'LoCoMo', 'v1', ${samples.length}, ${questionCount}, ${personaCount}, ${promptExamples.length}, ${q(inputPath)}, ${q(personasPath)}, ${q(promptExamplesDir)});\n`;

for (const rawSample of samples) {
  const sample = assertSample(rawSample);
  sql += `INSERT INTO locomo_samples (sample_id, speaker_a, speaker_b, event_summary_json, observation_json, session_summary_json) VALUES (${q(sample.sample_id)}, ${q(String(sample.conversation.speaker_a ?? ""))}, ${q(String(sample.conversation.speaker_b ?? ""))}, ${qOrNull(sample.event_summary)}, ${qOrNull(sample.observation)}, ${qOrNull(sample.session_summary)});\n`;

  for (const date of flattenSessionDates(sample)) {
    sql += `INSERT INTO locomo_session_dates (id, sample_id, session_index, date_time) VALUES (${q(date.id)}, ${q(sample.sample_id)}, ${date.sessionIndex}, ${q(date.dateTime)});\n`;
  }

  for (const summary of flattenSessionSummaries(sample)) {
    sql += `INSERT INTO locomo_session_summaries (id, sample_id, session_index, summary) VALUES (${q(summary.id)}, ${q(sample.sample_id)}, ${summary.sessionIndex}, ${q(summary.summary)});\n`;
  }

  for (const turn of flattenTurns(sample)) {
    sql += `INSERT INTO locomo_dialogue_turns (id, sample_id, session_index, turn_index, dia_id, speaker, text, image_urls_json, blip_caption, query) VALUES (${q(turn.id)}, ${q(sample.sample_id)}, ${turn.sessionIndex}, ${turn.turnIndex}, ${q(turn.diaId)}, ${q(turn.speaker)}, ${q(turn.text)}, ${q(JSON.stringify(turn.imageUrls))}, ${qOrNull(turn.blipCaption)}, ${qOrNull(turn.query)});\n`;
  }

  for (let index = 0; index < sample.qa.length; index++) {
    const qa = sample.qa[index];
    const id = questionId(sample.sample_id, index);
    sql += `INSERT INTO locomo_questions (id, sample_id, question_index, question, expected_answer, adversarial_answer, category, evidence_json) VALUES (${q(id)}, ${q(sample.sample_id)}, ${index}, ${q(String(qa.question))}, ${q(stringifyAnswer(qa.answer))}, ${qOrNull(qa.adversarial_answer)}, ${typeof qa.category === "number" ? qa.category : "NULL"}, ${q(JSON.stringify(qa.evidence ?? []))});\n`;
  }
}

for (const row of flattenPersonas(personas)) {
  sql += `INSERT INTO locomo_msc_personas (id, split, split_index, speaker_1_json, speaker_2_json, in_dataset, raw_json) VALUES (${q(row.id)}, ${q(row.split)}, ${row.splitIndex}, ${q(JSON.stringify(row.speaker1))}, ${q(JSON.stringify(row.speaker2))}, ${row.inDataset ? 1 : 0}, ${q(JSON.stringify(row.raw))});\n`;
}

for (const example of promptExamples) {
  sql += `INSERT INTO locomo_prompt_examples (id, file_name, slug, payload_json, top_level_type, example_count) VALUES (${q(example.slug)}, ${q(example.fileName)}, ${q(example.slug)}, ${q(JSON.stringify(example.payload))}, ${q(example.topLevelType)}, ${example.exampleCount ?? "NULL"});\n`;
}

await mkdir(outDir, { recursive: true });
await writeFile(outFile, sql);
console.log(
  JSON.stringify(
    {
      outFile,
      samples: samples.length,
      questions: questionCount,
      personas: personaCount,
      promptExamples: promptExamples.length,
    },
    null,
    2,
  ),
);

function assertSample(sample) {
  if (!sample || typeof sample !== "object") throw new Error("Invalid LoCoMo sample");
  if (!sample.sample_id || !Array.isArray(sample.qa) || !sample.conversation) {
    throw new Error(`Invalid LoCoMo sample shape: ${JSON.stringify(sample).slice(0, 200)}`);
  }
  return sample;
}

function flattenTurns(sample) {
  const turns = [];
  for (const [key, value] of Object.entries(sample.conversation)) {
    const match = /^session_(\d+)$/.exec(key);
    if (!match || !Array.isArray(value)) continue;
    const sessionIndex = Number(match[1]);
    value.forEach((turn, turnIndex) => {
      turns.push({
        id: `${sample.sample_id}_${turn.dia_id ?? `${sessionIndex}_${turnIndex}`}`.replace(/[^a-zA-Z0-9:_-]/g, "_"),
        sessionIndex,
        turnIndex,
        diaId: String(turn.dia_id ?? ""),
        speaker: String(turn.speaker ?? ""),
        text: String(turn.text ?? ""),
        imageUrls: Array.isArray(turn.img_url) ? turn.img_url : [],
        blipCaption: turn.blip_caption,
        query: turn.query,
      });
    });
  }
  return turns.sort((a, b) => a.sessionIndex - b.sessionIndex || a.turnIndex - b.turnIndex);
}

function flattenSessionDates(sample) {
  const rows = [];
  for (const [key, value] of Object.entries(sample.conversation)) {
    const match = /^session_(\d+)_date_time$/.exec(key);
    if (!match || typeof value !== "string") continue;
    const sessionIndex = Number(match[1]);
    rows.push({
      id: `${sample.sample_id}_session_${sessionIndex}_date`,
      sessionIndex,
      dateTime: value,
    });
  }
  return rows.sort((a, b) => a.sessionIndex - b.sessionIndex);
}

function flattenSessionSummaries(sample) {
  const summaries = sample.session_summary;
  if (!summaries || typeof summaries !== "object") return [];
  const rows = [];
  for (const [key, value] of Object.entries(summaries)) {
    const match = /^session_(\d+)_summary$/.exec(key);
    if (!match || typeof value !== "string") continue;
    const sessionIndex = Number(match[1]);
    rows.push({
      id: `${sample.sample_id}_session_${sessionIndex}_summary`,
      sessionIndex,
      summary: value,
    });
  }
  return rows.sort((a, b) => a.sessionIndex - b.sessionIndex);
}

function flattenPersonas(personasBySplit) {
  const rows = [];
  for (const split of ["train", "valid", "test"]) {
    const splitRows = personasBySplit?.[split];
    if (!Array.isArray(splitRows)) continue;
    splitRows.forEach((row, index) => {
      rows.push({
        id: `locomo_msc_${split}_${index}`,
        split,
        splitIndex: index,
        speaker1: Array.isArray(row["Speaker 1"]) ? row["Speaker 1"] : [],
        speaker2: Array.isArray(row["Speaker 2"]) ? row["Speaker 2"] : [],
        inDataset: Boolean(row.in_dataset),
        raw: row,
      });
    });
  }
  return rows;
}

async function readPromptExamples(dir) {
  const fileNames = (await readdir(dir)).filter((fileName) => fileName.endsWith(".json")).sort();
  const rows = [];
  for (const fileName of fileNames) {
    const filePath = resolve(dir, fileName);
    const payload = JSON.parse(await readFile(filePath, "utf8"));
    const examples = payload && typeof payload === "object" ? payload.examples : undefined;
    rows.push({
      fileName,
      slug: basename(fileName, ".json").replace(/[^a-zA-Z0-9:_-]/g, "_"),
      payload,
      topLevelType: Array.isArray(payload) ? "array" : typeof payload,
      exampleCount: Array.isArray(examples) ? examples.length : Array.isArray(payload) ? payload.length : null,
    });
  }
  return rows;
}

function questionId(sampleId, index) {
  return `locomo_${sampleId}_${index}`.replace(/[^a-zA-Z0-9:_-]/g, "_");
}

function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function qOrNull(value) {
  if (value === undefined || value === null) return "NULL";
  return q(typeof value === "string" ? value : JSON.stringify(value));
}

function stringifyAnswer(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function repoRoot() {
  return new URL("..", import.meta.url);
}
