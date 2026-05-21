import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { loadAuth, loadConfig } from "../config.js";
import { die, printJson } from "../output.js";

interface MemoryRow {
  id: string;
  agent_id: string;
  pid: string;
  tid: string | null;
  content: string;
  created_at: string;
  score?: number | null;
}

export function registerMemoriesCommand(program: Command): void {
  const memories = program
    .command("memories")
    .description("Read and write memories (Clerk + x-agent-id or mst_* API key)");

  memories
    .command("add")
    .description("Write a memory")
    .requiredOption("-c, --content <text>", "Memory content")
    .option("-a, --agent <id>", "Agent id (defaults to config defaultAgentId)")
    .option("--pid <pid>", "process / project")
    .option("--tid <tid>", "Thread (optional)")
    .option("--no-kg", "Skip knowledge graph extraction")
    .option("--json", "Output JSON")
    .action(
      async (opts: {
        content: string;
        agent?: string;
        pid?: string;
        tid?: string;
        noKg?: boolean;
        json?: boolean;
      }) => {
        const config = loadConfig();
        const auth = loadAuth();
        const agentId = opts.agent ?? config.defaultAgentId;
        if (!agentId && !auth.apiKey) {
          die("Specify --agent or run memost agents create / agents use first");
        }
        try {
          const data = await apiRequest({
            method: "POST",
            path: "/v1/memories",
            auth: auth.apiKey ? "api_key" : "clerk",
            agentId,
            body: {
              agentId,
              content: opts.content,
              pid: opts.pid,
              tid: opts.tid,
              extractKg: opts.noKg ? false : undefined,
            },
          });
          if (opts.json) printJson(data);
          else console.log("Memory written.");
        } catch (err) {
          die(err instanceof Error ? err.message : String(err));
        }
      },
    );

  memories
    .command("search")
    .description("Search memories")
    .requiredOption("-q, --query <text>", "Query text")
    .option("-a, --agent <id>", "Agent id")
    .option("--pid <pid>", "Limit to a process")
    .option("--tid <tid>", "Limit to a thread")
    .option("-l, --limit <n>", "Max results", "8")
    .option("--json", "Output JSON")
    .action(
      async (opts: {
        query: string;
        agent?: string;
        pid?: string;
        tid?: string;
        limit: string;
        json?: boolean;
      }) => {
        const config = loadConfig();
        const auth = loadAuth();
        const agentId = opts.agent ?? config.defaultAgentId;
        if (!agentId && !auth.apiKey) {
          die("Specify --agent or configure defaultAgentId / apiKey");
        }
        try {
          const data = await apiRequest<{
            memories: MemoryRow[];
            triples: unknown[];
          }>({
            method: "POST",
            path: "/v1/memories/search",
            auth: auth.apiKey ? "api_key" : "clerk",
            agentId,
            body: {
              agentId,
              query: opts.query,
              pid: opts.pid,
              tid: opts.tid,
              limit: Number(opts.limit),
            },
          });
          if (opts.json) {
            printJson(data);
            return;
          }
          for (const m of data.memories ?? []) {
            const scope = m.tid ? `${m.pid}/${m.tid}` : m.pid;
            const score =
              typeof m.score === "number" ? ` [${m.score.toFixed(3)}]` : "";
            console.log(`• (${scope})${score} ${m.content}`);
          }
          if ((data.triples ?? []).length > 0) {
            console.log(`\n${data.triples.length} graph matches found (use --json for details)`);
          }
        } catch (err) {
          die(err instanceof Error ? err.message : String(err));
        }
      },
    );

  memories
    .command("list")
    .description("List memories")
    .option("-a, --agent <id>", "Agent id")
    .option("--pid <pid>", "Limit to a process")
    .option("--tid <tid>", "Limit to a thread")
    .option("-l, --limit <n>", "Count", "20")
    .option("--json", "Output JSON")
    .action(
      async (opts: {
        agent?: string;
        pid?: string;
        tid?: string;
        limit: string;
        json?: boolean;
      }) => {
        const config = loadConfig();
        const auth = loadAuth();
        const agentId = opts.agent ?? config.defaultAgentId;
        if (!agentId && !auth.apiKey) {
          die("Specify --agent");
        }
        const qs = new URLSearchParams();
        if (opts.pid) qs.set("pid", opts.pid);
        if (opts.tid) qs.set("tid", opts.tid);
        qs.set("limit", opts.limit);
        if (agentId) qs.set("agentId", agentId);
        try {
          const data = await apiRequest<{ memories: MemoryRow[] }>({
            path: `/v1/memories?${qs.toString()}`,
            auth: auth.apiKey ? "api_key" : "clerk",
            agentId,
          });
          if (opts.json) printJson(data.memories ?? []);
          else {
            for (const m of data.memories ?? []) {
              const scope = m.tid ? `${m.pid}/${m.tid}` : m.pid;
              console.log(`• (${scope}) ${m.content}`);
            }
          }
        } catch (err) {
          die(err instanceof Error ? err.message : String(err));
        }
      },
    );
}
