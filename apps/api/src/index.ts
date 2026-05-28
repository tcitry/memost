import { Hono } from "hono";
import { cors } from "hono/cors";
import { clerk } from "./auth";
import { processEvalQueue } from "./eval-service";
import { jsonError } from "./http";
import agentsRoute from "./routes/agents";
import evalsRoute from "./routes/evals";
import memoriesRoute from "./routes/memories";
import type { EvalQueueMessage, HonoEnv } from "./types";

const app = new Hono<HonoEnv>();

// CORS for the dashboard at memo.st (and *.memo.st previews) plus local
// dev. Adjust origins via environment if more surfaces appear.
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (
        origin.endsWith(".memo.st") ||
        origin === "https://memo.st" ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      ) {
        return origin;
      }
      return undefined;
    },
    allowHeaders: ["authorization", "content-type", "x-agent-id"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 600,
  }),
);

// Clerk session middleware runs everywhere; route-level guards decide
// whether a session is required.
app.use("*", clerk);

app.get("/health", (c) =>
  c.json({
    ok: true,
    env: c.env.MEMOST_ENV,
    embedding: c.env.EMBEDDING_MODEL,
    dimensions: Number(c.env.VECTOR_DIMENSIONS),
  }),
);

app.route("/v1/agents", agentsRoute);
app.route("/v1/memories", memoriesRoute);
app.route("/v1/evals", evalsRoute);

app.onError((err, c) => jsonError(c, err));
app.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<EvalQueueMessage>, env: HonoEnv["Bindings"]) {
    for (const message of batch.messages) {
      await processEvalQueue(env, message.body);
      message.ack();
    }
  },
} satisfies ExportedHandler<HonoEnv["Bindings"], EvalQueueMessage>;
