import { createFileRoute } from "@tanstack/react-router";
import { ApiCallError, callApi } from "../../../../../lib/api-client";

export const Route = createFileRoute("/api/agents/$id/keys/$keyId")({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        try {
          const data = await callApi({
            method: "DELETE",
            path: `/v1/agents/${encodeURIComponent(params.id)}/keys/${encodeURIComponent(params.keyId)}`,
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
  console.error("api.agents.keys.revoke proxy error", err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
