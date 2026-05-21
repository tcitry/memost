import { createFileRoute } from "@tanstack/react-router";
import { ApiCallError, callApi } from "../../../../lib/api-client";

// /api/agents/:id/keys — list + create keys for one agent.
export const Route = createFileRoute("/api/agents/$id/keys")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const data = await callApi({
            method: "GET",
            path: `/v1/agents/${encodeURIComponent(params.id)}/keys`,
          });
          return Response.json(data);
        } catch (err) {
          return errorResponse(err);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const data = await callApi({
            method: "POST",
            path: `/v1/agents/${encodeURIComponent(params.id)}/keys`,
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
  console.error("api.agents.keys proxy error", err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
