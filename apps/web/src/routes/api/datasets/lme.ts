import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

type LmeView = "summary" | "questions" | "sessions" | "turns";

export const Route = createFileRoute("/api/datasets/lme")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const view = parseView(url.searchParams.get("view"));
          const limit = clamp(Number(url.searchParams.get("limit") ?? 50), 1, 200);
          const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
          const variant = clean(url.searchParams.get("variant"));
          const questionId = clean(url.searchParams.get("questionId"));
          const questionType = clean(url.searchParams.get("questionType"));
          const q = clean(url.searchParams.get("q"));

          if (view === "summary") return Response.json(await readSummary(env.BENCHMARK_DATASET_DB));
          if (view === "sessions") {
            return Response.json(
              await readSessions(env.BENCHMARK_DATASET_DB, { limit, offset, variant, questionId, q }),
            );
          }
          if (view === "turns") {
            return Response.json(
              await readTurns(env.BENCHMARK_DATASET_DB, { limit, offset, variant, questionId, q }),
            );
          }
          return Response.json(
            await readQuestions(env.BENCHMARK_DATASET_DB, {
              limit,
              offset,
              variant,
              questionId,
              questionType,
              q,
            }),
          );
        } catch (err) {
          console.error("api.datasets.lme error", err);
          return Response.json({ error: "Failed to read LongMemEval dataset" }, { status: 500 });
        }
      },
    },
  },
});

async function readSummary(db: D1Database) {
  const [metadata, variants, typeRows, questionCount, sessionCount, turnCount] = await Promise.all([
    db.prepare("select * from lme_metadata where slug = ?").bind("lme").first(),
    db.prepare("select variant, count(*) as count from lme_questions group by variant order by variant").all(),
    db
      .prepare(
        "select question_type, count(*) as count from lme_questions group by question_type order by question_type",
      )
      .all(),
    db.prepare("select count(*) as count from lme_questions").first(),
    db.prepare("select count(*) as count from lme_sessions").first(),
    db.prepare("select count(*) as count from lme_turns").first(),
  ]);
  return {
    metadata,
    counts: {
      questions: Number(questionCount?.count ?? 0),
      sessions: Number(sessionCount?.count ?? 0),
      turns: Number(turnCount?.count ?? 0),
    },
    variants: variants.results,
    questionTypes: typeRows.results,
  };
}

async function readQuestions(
  db: D1Database,
  opts: {
    limit: number;
    offset: number;
    variant: string | null;
    questionId: string | null;
    questionType: string | null;
    q: string | null;
  },
) {
  const { whereSql, bindings } = buildWhere([
    opts.variant ? ["variant = ?", opts.variant] : null,
    opts.questionId ? ["question_id = ?", opts.questionId] : null,
    opts.questionType ? ["question_type = ?", opts.questionType] : null,
    opts.q ? ["(question like ? or expected_answer like ?)", `%${opts.q}%`, `%${opts.q}%`] : null,
  ]);
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select id, variant, question_id, question_type, is_abstention, question, expected_answer,
          question_date, session_count, turn_count, answer_session_ids_json, raw_json_truncated
        from lme_questions
        where ${whereSql}
        order by variant, question_id
        limit ? offset ?`,
      )
      .bind(...bindings, opts.limit, opts.offset)
      .all(),
    db.prepare(`select count(*) as count from lme_questions where ${whereSql}`).bind(...bindings).first(),
  ]);
  return { rows: rows.results, total: Number(total?.count ?? 0) };
}

async function readSessions(
  db: D1Database,
  opts: { limit: number; offset: number; variant: string | null; questionId: string | null; q: string | null },
) {
  const { whereSql, bindings } = buildWhere([
    opts.variant ? ["variant = ?", opts.variant] : null,
    opts.questionId ? ["question_id = ?", opts.questionId] : null,
    opts.q ? ["(session_id like ? or raw_json like ?)", `%${opts.q}%`, `%${opts.q}%`] : null,
  ]);
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select id, variant, question_id, session_index, session_id, session_date,
          is_answer_session, turn_count, raw_json_truncated
        from lme_sessions
        where ${whereSql}
        order by variant, question_id, session_index
        limit ? offset ?`,
      )
      .bind(...bindings, opts.limit, opts.offset)
      .all(),
    db.prepare(`select count(*) as count from lme_sessions where ${whereSql}`).bind(...bindings).first(),
  ]);
  return { rows: rows.results, total: Number(total?.count ?? 0) };
}

async function readTurns(
  db: D1Database,
  opts: { limit: number; offset: number; variant: string | null; questionId: string | null; q: string | null },
) {
  const { whereSql, bindings } = buildWhere([
    opts.variant ? ["variant = ?", opts.variant] : null,
    opts.questionId ? ["question_id = ?", opts.questionId] : null,
    opts.q ? ["(role like ? or content like ?)", `%${opts.q}%`, `%${opts.q}%`] : null,
  ]);
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select id, variant, question_id, session_index, turn_index, role, content, has_answer
        from lme_turns
        where ${whereSql}
        order by variant, question_id, session_index, turn_index
        limit ? offset ?`,
      )
      .bind(...bindings, opts.limit, opts.offset)
      .all(),
    db.prepare(`select count(*) as count from lme_turns where ${whereSql}`).bind(...bindings).first(),
  ]);
  return { rows: rows.results, total: Number(total?.count ?? 0) };
}

function buildWhere(parts: Array<[string, ...Array<string | number>] | null>) {
  const where = ["1 = 1"];
  const bindings: Array<string | number> = [];
  for (const part of parts) {
    if (!part) continue;
    where.push(part[0]);
    bindings.push(...part.slice(1));
  }
  return { whereSql: where.join(" and "), bindings };
}

function parseView(value: string | null): LmeView {
  if (value === "sessions" || value === "turns" || value === "questions") return value;
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
