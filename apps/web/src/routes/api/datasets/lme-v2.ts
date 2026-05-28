import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

type LmeV2View = "summary" | "questions" | "haystacks" | "trajectories" | "states";

export const Route = createFileRoute("/api/datasets/lme-v2")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const view = parseView(url.searchParams.get("view"));
          const limit = clamp(Number(url.searchParams.get("limit") ?? 50), 1, 200);
          const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
          const domain = clean(url.searchParams.get("domain"));
          const questionType = clean(url.searchParams.get("questionType"));
          const environment = clean(url.searchParams.get("environment"));
          const tier = clean(url.searchParams.get("tier"));
          const questionId = clean(url.searchParams.get("questionId"));
          const trajectoryId = clean(url.searchParams.get("trajectoryId"));
          const q = clean(url.searchParams.get("q"));

          if (view === "summary") return Response.json(await readSummary(env.BENCHMARK_DATASET_DB));
          if (view === "haystacks") {
            return Response.json(
              await readHaystacks(env.BENCHMARK_DATASET_DB, { limit, offset, tier, questionId }),
            );
          }
          if (view === "trajectories") {
            return Response.json(
              await readTrajectories(env.BENCHMARK_DATASET_DB, {
                limit,
                offset,
                domain,
                environment,
                trajectoryId,
                q,
              }),
            );
          }
          if (view === "states") {
            return Response.json(
              await readStates(env.BENCHMARK_DATASET_DB, { limit, offset, trajectoryId, q }),
            );
          }
          return Response.json(
            await readQuestions(env.BENCHMARK_DATASET_DB, {
              limit,
              offset,
              domain,
              environment,
              questionType,
              questionId,
              q,
            }),
          );
        } catch (err) {
          console.error("api.datasets.lme-v2 error", err);
          return Response.json({ error: "Failed to read LongMemEval-V2 dataset" }, { status: 500 });
        }
      },
    },
  },
});

async function readSummary(db: D1Database) {
  const [metadata, questions, haystacks, trajectories, states, domains, types, tiers] = await Promise.all([
    db.prepare("select * from lme_v2_metadata where slug = ?").bind("lme_v2").first(),
    db.prepare("select count(*) as count from lme_v2_questions").first(),
    db.prepare("select count(*) as count from lme_v2_haystacks").first(),
    db.prepare("select count(*) as count from lme_v2_trajectories").first(),
    db.prepare("select count(*) as count from lme_v2_states").first(),
    db.prepare("select domain, count(*) as count from lme_v2_questions group by domain order by domain").all(),
    db
      .prepare(
        "select question_type, count(*) as count from lme_v2_questions group by question_type order by question_type",
      )
      .all(),
    db.prepare("select tier, count(*) as count from lme_v2_haystacks group by tier order by tier").all(),
  ]);
  return {
    metadata,
    counts: {
      questions: Number(questions?.count ?? 0),
      haystacks: Number(haystacks?.count ?? 0),
      trajectories: Number(trajectories?.count ?? 0),
      states: Number(states?.count ?? 0),
    },
    domains: domains.results,
    questionTypes: types.results,
    tiers: tiers.results,
  };
}

async function readQuestions(
  db: D1Database,
  opts: {
    limit: number;
    offset: number;
    domain: string | null;
    environment: string | null;
    questionType: string | null;
    questionId: string | null;
    q: string | null;
  },
) {
  const { whereSql, bindings } = buildWhere([
    opts.domain ? ["domain = ?", opts.domain] : null,
    opts.environment ? ["environment = ?", opts.environment] : null,
    opts.questionType ? ["question_type = ?", opts.questionType] : null,
    opts.questionId ? ["id = ?", opts.questionId] : null,
    opts.q ? ["(question like ? or expected_answer like ?)", `%${opts.q}%`, `%${opts.q}%`] : null,
  ]);
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select id, domain, environment, question_type, question, expected_answer, image_path,
          eval_function, raw_json_truncated
        from lme_v2_questions
        where ${whereSql}
        order by domain, environment, id
        limit ? offset ?`,
      )
      .bind(...bindings, opts.limit, opts.offset)
      .all(),
    db.prepare(`select count(*) as count from lme_v2_questions where ${whereSql}`).bind(...bindings).first(),
  ]);
  return { rows: rows.results, total: Number(total?.count ?? 0) };
}

async function readHaystacks(
  db: D1Database,
  opts: { limit: number; offset: number; tier: string | null; questionId: string | null },
) {
  const { whereSql, bindings } = buildWhere([
    opts.tier ? ["tier = ?", opts.tier] : null,
    opts.questionId ? ["question_id = ?", opts.questionId] : null,
  ]);
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select h.id, h.tier, h.question_id, q.domain, q.environment, q.question_type,
          h.trajectory_count, h.trajectory_ids_json
        from lme_v2_haystacks h
        left join lme_v2_questions q on q.id = h.question_id
        where ${whereSql}
        order by h.tier, h.question_id
        limit ? offset ?`,
      )
      .bind(...bindings, opts.limit, opts.offset)
      .all(),
    db.prepare(`select count(*) as count from lme_v2_haystacks where ${whereSql}`).bind(...bindings).first(),
  ]);
  return { rows: rows.results, total: Number(total?.count ?? 0) };
}

async function readTrajectories(
  db: D1Database,
  opts: {
    limit: number;
    offset: number;
    domain: string | null;
    environment: string | null;
    trajectoryId: string | null;
    q: string | null;
  },
) {
  const { whereSql, bindings } = buildWhere([
    opts.domain ? ["domain = ?", opts.domain] : null,
    opts.environment ? ["environment = ?", opts.environment] : null,
    opts.trajectoryId ? ["id = ?", opts.trajectoryId] : null,
    opts.q ? ["(goal like ? or start_url like ?)", `%${opts.q}%`, `%${opts.q}%`] : null,
  ]);
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select id, domain, environment, goal, outcome, start_url, state_count, raw_json_truncated
        from lme_v2_trajectories
        where ${whereSql}
        order by domain, environment, id
        limit ? offset ?`,
      )
      .bind(...bindings, opts.limit, opts.offset)
      .all(),
    db.prepare(`select count(*) as count from lme_v2_trajectories where ${whereSql}`).bind(...bindings).first(),
  ]);
  return { rows: rows.results, total: Number(total?.count ?? 0) };
}

async function readStates(
  db: D1Database,
  opts: { limit: number; offset: number; trajectoryId: string | null; q: string | null },
) {
  const { whereSql, bindings } = buildWhere([
    opts.trajectoryId ? ["trajectory_id = ?", opts.trajectoryId] : null,
    opts.q
      ? ["(url like ? or action like ? or thought like ? or accessibility_tree_preview like ?)", `%${opts.q}%`, `%${opts.q}%`, `%${opts.q}%`, `%${opts.q}%`]
      : null,
  ]);
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `select id, trajectory_id, state_index, step, url, action, thought,
          accessibility_tree_preview, screenshot_path
        from lme_v2_states
        where ${whereSql}
        order by trajectory_id, state_index
        limit ? offset ?`,
      )
      .bind(...bindings, opts.limit, opts.offset)
      .all(),
    db.prepare(`select count(*) as count from lme_v2_states where ${whereSql}`).bind(...bindings).first(),
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

function parseView(value: string | null): LmeV2View {
  if (value === "haystacks" || value === "trajectories" || value === "states" || value === "questions") {
    return value;
  }
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
