import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

type LocomoView = "summary" | "samples" | "questions" | "turns";

export const Route = createFileRoute("/api/datasets/locomo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const view = parseView(url.searchParams.get("view"));
          const limit = clamp(Number(url.searchParams.get("limit") ?? 50), 1, 200);
          const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
          const sampleId = clean(url.searchParams.get("sampleId"));
          const category = clean(url.searchParams.get("category"));
          const q = clean(url.searchParams.get("q"));

          if (view === "summary") {
            return Response.json(await readSummary(env.BENCHMARK_DATASET_DB));
          }
          if (view === "samples") {
            return Response.json(await readSamples(env.BENCHMARK_DATASET_DB, { limit, offset }));
          }
          if (view === "questions") {
            return Response.json(
              await readQuestions(env.BENCHMARK_DATASET_DB, {
                limit,
                offset,
                sampleId,
                category,
                q,
              }),
            );
          }
          return Response.json(
            await readTurns(env.BENCHMARK_DATASET_DB, {
              limit,
              offset,
              sampleId,
              q,
            }),
          );
        } catch (err) {
          console.error("api.datasets.locomo error", err);
          return Response.json({ error: "Failed to read dataset" }, { status: 500 });
        }
      },
    },
  },
});

async function readSummary(db: D1Database) {
  const [metadata, sampleCount, questionCount, turnCount, categories] = await Promise.all([
    db.prepare("select * from locomo_metadata where slug = ?").bind("locomo").first(),
    db.prepare("select count(*) as count from locomo_samples").first(),
    db.prepare("select count(*) as count from locomo_questions").first(),
    db.prepare("select count(*) as count from locomo_dialogue_turns").first(),
    db
      .prepare(
        "select category, count(*) as count from locomo_questions group by category order by category",
      )
      .all(),
  ]);

  return {
    metadata,
    counts: {
      samples: Number(sampleCount?.count ?? 0),
      questions: Number(questionCount?.count ?? 0),
      turns: Number(turnCount?.count ?? 0),
    },
    categories: categories.results,
  };
}

async function readSamples(db: D1Database, opts: { limit: number; offset: number }) {
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select s.sample_id, s.speaker_a, s.speaker_b,
          count(distinct q.id) as question_count,
          count(distinct t.id) as turn_count
        from locomo_samples s
        left join locomo_questions q on q.sample_id = s.sample_id
        left join locomo_dialogue_turns t on t.sample_id = s.sample_id
        group by s.sample_id
        order by s.sample_id
        limit ? offset ?`,
      )
      .bind(opts.limit, opts.offset)
      .all(),
    db.prepare("select count(*) as count from locomo_samples").first(),
  ]);

  return { rows: rows.results, total: Number(total?.count ?? 0) };
}

async function readQuestions(
  db: D1Database,
  opts: { limit: number; offset: number; sampleId: string | null; category: string | null; q: string | null },
) {
  const where = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (opts.sampleId) {
    where.push("sample_id = ?");
    bindings.push(opts.sampleId);
  }
  if (opts.category) {
    where.push("category = ?");
    bindings.push(Number(opts.category));
  }
  if (opts.q) {
    where.push("(question like ? or expected_answer like ?)");
    bindings.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  const whereSql = where.join(" and ");
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select id, sample_id, question_index, question, expected_answer, category, evidence_json
        from locomo_questions
        where ${whereSql}
        order by sample_id, question_index
        limit ? offset ?`,
      )
      .bind(...bindings, opts.limit, opts.offset)
      .all(),
    db
      .prepare(`select count(*) as count from locomo_questions where ${whereSql}`)
      .bind(...bindings)
      .first(),
  ]);

  return { rows: rows.results, total: Number(total?.count ?? 0) };
}

async function readTurns(
  db: D1Database,
  opts: { limit: number; offset: number; sampleId: string | null; q: string | null },
) {
  const where = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (opts.sampleId) {
    where.push("sample_id = ?");
    bindings.push(opts.sampleId);
  }
  if (opts.q) {
    where.push("(text like ? or speaker like ? or dia_id like ?)");
    bindings.push(`%${opts.q}%`, `%${opts.q}%`, `%${opts.q}%`);
  }
  const whereSql = where.join(" and ");
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select id, sample_id, session_index, turn_index, dia_id, speaker, text, image_urls_json, blip_caption, query
        from locomo_dialogue_turns
        where ${whereSql}
        order by sample_id, session_index, turn_index
        limit ? offset ?`,
      )
      .bind(...bindings, opts.limit, opts.offset)
      .all(),
    db
      .prepare(`select count(*) as count from locomo_dialogue_turns where ${whereSql}`)
      .bind(...bindings)
      .first(),
  ]);

  return { rows: rows.results, total: Number(total?.count ?? 0) };
}

function parseView(value: string | null): LocomoView {
  if (value === "samples" || value === "questions" || value === "turns") return value;
  return "summary";
}

function clean(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
