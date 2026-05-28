import { Hono } from "hono";
import { requireClerk } from "../auth";
import {
  createEvalRun,
  getEvalRun,
  listEvalDatasets,
  listEvalItems,
  listEvalRuns,
} from "../eval-service";
import { HttpError, readJson } from "../http";
import type { HonoEnv } from "../types";

const app = new Hono<HonoEnv>();

app.use("*", requireClerk);

app.get("/datasets", async (c) => c.json(await listEvalDatasets(c.env)));

app.get("/datasets/:slug/items", async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0));
  const categoryQuery = c.req.query("category");
  const category = categoryQuery === undefined ? null : Number(categoryQuery);
  if (categoryQuery !== undefined && !Number.isFinite(category)) {
    throw new HttpError(422, "Query parameter 'category' must be a number");
  }

  return c.json(
    await listEvalItems(c.env, c.req.param("slug"), {
      sampleId: c.req.query("sampleId") ?? null,
      category,
      limit,
      offset,
    }),
  );
});

app.get("/runs", async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25)));
  return c.json(await listEvalRuns(c.env, c.var.principal.ownerId, limit));
});

app.post("/runs", async (c) => {
  const body = await readJson<{
    datasetSlug?: string;
    mode?: "full" | "batch" | "single";
    sampleIds?: string[];
    itemIds?: string[];
    limit?: number;
    offset?: number;
    categories?: number[];
    endpoint?: {
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      headers?: Record<string, string>;
      timeoutMs?: number;
    };
    judgeModel?: string;
    enqueue?: boolean;
  }>(c);
  if (!body.endpoint) throw new HttpError(422, "Field 'endpoint' is required");

  return c.json(
    await createEvalRun(c.env, {
      ownerId: c.var.principal.ownerId,
      datasetSlug: body.datasetSlug,
      mode: body.mode,
      sampleIds: body.sampleIds,
      itemIds: body.itemIds,
      limit: body.limit,
      offset: body.offset,
      categories: body.categories,
      endpoint: {
        baseUrl: body.endpoint.baseUrl ?? "",
        apiKey: body.endpoint.apiKey ?? "",
        model: body.endpoint.model,
        headers: body.endpoint.headers,
        timeoutMs: body.endpoint.timeoutMs,
      },
      judgeModel: body.judgeModel,
      enqueue: body.enqueue,
    }),
    202,
  );
});

app.get("/runs/:id", async (c) =>
  c.json(await getEvalRun(c.env, c.var.principal.ownerId, c.req.param("id"))),
);

export default app;
