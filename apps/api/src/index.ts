import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createMemory,
  getLimit,
  getMemory,
  listMemories,
  searchMemories,
} from "./memories";
import { jsonError, readJson } from "./http";
import type { CreateMemoryInput, SearchMemoryInput } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: ["https://memo.st", "http://localhost:3000", "http://localhost:3001"],
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "memo-st-api",
    environment: c.env.MEMOST_ENV,
  }),
);

app.get("/v1/memories", async (c) => {
  try {
    const organizationId = c.req.query("organizationId");

    if (!organizationId) {
      return c.json({ error: "organizationId is required" }, 422);
    }

    const memories = await listMemories(
      c.env.DB,
      organizationId,
      c.req.query("namespace"),
      getLimit(c.req.query("limit")),
    );

    return c.json({ memories });
  } catch (error) {
    return jsonError(c, error);
  }
});

app.post("/v1/memories", async (c) => {
  try {
    const input = await readJson<CreateMemoryInput>(c);
    const memory = await createMemory(c.env, input, c.executionCtx);
    return c.json({ memory }, 201);
  } catch (error) {
    return jsonError(c, error);
  }
});

app.get("/v1/memories/:id", async (c) => {
  try {
    const memory = await getMemory(c.env.DB, c.req.param("id"));
    return c.json({ memory });
  } catch (error) {
    return jsonError(c, error);
  }
});

app.post("/v1/memories/search", async (c) => {
  try {
    const input = await readJson<SearchMemoryInput>(c);
    const result = await searchMemories(c.env, input);
    return c.json(result);
  } catch (error) {
    return jsonError(c, error);
  }
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((error, c) => jsonError(c, error));

export default app;
