import { auth } from "@clerk/tanstack-react-start/server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/memories")({
  server: {
    handlers: {
      GET: async () => {
        const session = await auth();

        return Response.json({
          authenticated: Boolean(session.userId),
          ownerId: session.orgId ?? session.userId ?? "anonymous-demo",
          memories: [
            {
              id: "mem_demo_001",
              agentId: "support-agent",
              namespace: "org_demo/customer/acme",
              content:
                "Acme prefers SOC2-ready vendors, EU data residency, and Slack escalation for P0 incidents.",
              confidence: 0.94,
            },
            {
              id: "mem_demo_002",
              agentId: "research-agent",
              namespace: "org_demo/product/memo-st",
              content:
                "The target product is an agent memory SaaS for memo.st, comparable to mem0 but Cloudflare-native.",
              confidence: 0.91,
            },
          ],
        });
      },
    },
  },
});
