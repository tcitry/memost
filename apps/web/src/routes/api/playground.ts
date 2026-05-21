import { createFileRoute } from "@tanstack/react-router";
import { ApiCallError, callApi } from "../../lib/api-client";

interface PlaygroundRequest {
  op: "add" | "search";
  agentId: string;
  content?: string;
  query?: string;
  pid?: string;
  tid?: string;
  limit?: number;
}

// Single proxy for the playground page. Dispatches to /v1/memories or
// /v1/memories/search based on the `op` field. Keeps the client surface
// minimal (one fetch helper).
export const Route = createFileRoute("/api/playground")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as PlaygroundRequest;
          if (!body.agentId) {
            return Response.json(
              { error: "agentId is required" },
              { status: 422 },
            );
          }

          if (body.op === "add") {
            if (!body.content?.trim()) {
              return Response.json(
                { error: "content is required" },
                { status: 422 },
              );
            }
            const data = await callApi({
              method: "POST",
              path: "/v1/memories",
              agentId: body.agentId,
              body: {
                content: body.content,
                pid: body.pid,
                tid: body.tid,
                extractKg: true,
              },
            });
            return Response.json(data);
          }

          if (body.op === "search") {
            if (!body.query?.trim()) {
              return Response.json(
                { error: "query is required" },
                { status: 422 },
              );
            }
            const data = await callApi({
              method: "POST",
              path: "/v1/memories/search",
              agentId: body.agentId,
              body: {
                query: body.query,
                pid: body.pid,
                tid: body.tid,
                limit: body.limit ?? 10,
                includeKg: true,
              },
            });
            return Response.json(data);
          }

          return Response.json({ error: "Unknown op" }, { status: 400 });
        } catch (err) {
          if (err instanceof ApiCallError) {
            return Response.json(
              { error: err.message },
              { status: err.status },
            );
          }
          console.error("api.playground proxy error", err);
          return Response.json({ error: "Internal error" }, { status: 500 });
        }
      },
    },
  },
});
