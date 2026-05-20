import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { loadConfig } from "../config.js";
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
    .description("记忆读写（Clerk + x-agent-id 或 mst_* API Key）");

  memories
    .command("add")
    .description("写入一条记忆")
    .requiredOption("-c, --content <text>", "记忆内容")
    .option("-a, --agent <id>", "Agent id（默认读配置 defaultAgentId）")
    .option("--pid <pid>", "process / project")
    .option("--tid <tid>", "thread（可选）")
    .option("--no-kg", "跳过知识图谱抽取")
    .option("--json", "以 JSON 输出")
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
        const agentId = opts.agent ?? config.defaultAgentId;
        if (!agentId && !config.apiKey) {
          die("请指定 --agent 或先 memost agents create / agents use");
        }
        try {
          const data = await apiRequest({
            method: "POST",
            path: "/v1/memories",
            auth: config.apiKey ? "api_key" : "clerk",
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
          else console.log("记忆已写入。");
        } catch (err) {
          die(err instanceof Error ? err.message : String(err));
        }
      },
    );

  memories
    .command("search")
    .description("检索记忆")
    .requiredOption("-q, --query <text>", "查询文本")
    .option("-a, --agent <id>", "Agent id")
    .option("--pid <pid>", "限定 process")
    .option("--tid <tid>", "限定 thread")
    .option("-l, --limit <n>", "条数上限", "8")
    .option("--json", "以 JSON 输出")
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
        const agentId = opts.agent ?? config.defaultAgentId;
        if (!agentId && !config.apiKey) {
          die("请指定 --agent 或配置 defaultAgentId / apiKey");
        }
        try {
          const data = await apiRequest<{
            memories: MemoryRow[];
            triples: unknown[];
          }>({
            method: "POST",
            path: "/v1/memories/search",
            auth: config.apiKey ? "api_key" : "clerk",
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
            console.log(`\n${data.triples.length} 条图谱命中（用 --json 查看详情）`);
          }
        } catch (err) {
          die(err instanceof Error ? err.message : String(err));
        }
      },
    );

  memories
    .command("list")
    .description("列出记忆")
    .option("-a, --agent <id>", "Agent id")
    .option("--pid <pid>", "限定 process")
    .option("--tid <tid>", "限定 thread")
    .option("-l, --limit <n>", "条数", "20")
    .option("--json", "以 JSON 输出")
    .action(
      async (opts: {
        agent?: string;
        pid?: string;
        tid?: string;
        limit: string;
        json?: boolean;
      }) => {
        const config = loadConfig();
        const agentId = opts.agent ?? config.defaultAgentId;
        if (!agentId && !config.apiKey) {
          die("请指定 --agent");
        }
        const qs = new URLSearchParams();
        if (opts.pid) qs.set("pid", opts.pid);
        if (opts.tid) qs.set("tid", opts.tid);
        qs.set("limit", opts.limit);
        if (agentId) qs.set("agentId", agentId);
        try {
          const data = await apiRequest<{ memories: MemoryRow[] }>({
            path: `/v1/memories?${qs.toString()}`,
            auth: config.apiKey ? "api_key" : "clerk",
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
