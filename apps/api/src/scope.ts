import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { createDb } from "./db/client";
import { agents } from "./db/schema";
import { HttpError } from "./http";
import type { AgentRow, HonoEnv } from "./types";

export interface MemoryScope {
  ownerId: string;
  agent: AgentRow;
  pid: string;
  tid: string | null;
  subjectId: string;
  namespace: string;
}

export async function resolveAgent(
  c: Context<HonoEnv>,
  bodyAgentId?: string,
): Promise<AgentRow> {
  const principal = c.var.principal;
  const headerAgent = c.req.header("x-agent-id") ?? "";
  const candidate =
    principal.source === "api_key"
      ? principal.agentId
      : bodyAgentId ?? c.req.query("agentId") ?? headerAgent;
  if (!candidate) throw new HttpError(422, "Missing agent id");
  const db = createDb(c.env.DB);
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, candidate), eq(agents.owner_id, principal.ownerId)),
  });
  if (!agent) throw new HttpError(404, "Agent not found");
  return agent satisfies AgentRow;
}

export function buildMemoryScope(args: {
  agent: AgentRow;
  ownerId: string;
  pid?: string;
  tid?: string;
  subjectId?: string;
  namespace?: string;
}): MemoryScope {
  const pid = (args.pid ?? args.agent.default_pid).trim() || args.agent.default_pid;
  const tid = args.tid?.trim() || null;
  const subjectId = (args.subjectId ?? args.ownerId).trim() || args.ownerId;
  const namespace = (args.namespace ?? `${pid}${tid ? `/${tid}` : ""}`).trim();
  return {
    ownerId: args.ownerId,
    agent: args.agent,
    pid,
    tid,
    subjectId,
    namespace,
  };
}
