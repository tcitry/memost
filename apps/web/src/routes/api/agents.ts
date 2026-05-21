import { createFileRoute } from "@tanstack/react-router";
import { ApiCallError, callApi } from "../../lib/api-client";

// Server-only proxy: list and create agents.
export const Route = createFileRoute("/api/agents")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const data = await callApi({ method: "GET", path: "/v1/agents" });
          return Response.json(data);
        } catch (err) {
          return errorResponse(err);
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const data = await callApi({
            method: "POST",
            path: "/v1/agents",
            body,
          });
          return Response.json(data);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});

function errorResponse(err: unknown): Response {
  if (err instanceof ApiCallError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("api.agents proxy error", err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
