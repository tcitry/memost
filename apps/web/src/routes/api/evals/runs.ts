import { createFileRoute } from "@tanstack/react-router";
import { ApiCallError, callApi } from "../../../lib/api-client";

export const Route = createFileRoute("/api/evals/runs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const limit = url.searchParams.get("limit") ?? "25";
          const data = await callApi({
            method: "GET",
            path: `/v1/evals/runs?limit=${encodeURIComponent(limit)}`,
          });
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
            path: "/v1/evals/runs",
            body,
          });
          return Response.json(data, { status: 202 });
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
  console.error("api.evals.runs proxy error", err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
