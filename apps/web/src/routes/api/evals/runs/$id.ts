import { createFileRoute } from "@tanstack/react-router";
import { ApiCallError, callApi } from "../../../../lib/api-client";

export const Route = createFileRoute("/api/evals/runs/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const data = await callApi({
            method: "GET",
            path: `/v1/evals/runs/${encodeURIComponent(params.id)}`,
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
  console.error("api.evals.run proxy error", err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
