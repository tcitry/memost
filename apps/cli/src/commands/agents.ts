import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { loadConfig, saveConfig } from "../config.js";
import { die, printJson, printTable } from "../output.js";

interface AgentRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  default_pid: string;
  created_at: string;
  updated_at: string;
}

export function registerAgentsCommand(program: Command): void {
  const agents = program.command("agents").description("管理 Agent（需 Clerk 登录）");

  agents
    .command("list")
    .description("列出当前组织/用户下的所有 Agent")
    .option("--json", "以 JSON 输出")
    .action(async (opts: { json?: boolean }) => {
      try {
        const data = await apiRequest<{ agents: AgentRow[] }>({
          path: "/v1/agents",
          auth: "clerk",
        });
        const list = data.agents ?? [];
        if (opts.json) {
          printJson(list);
          return;
        }
        printTable(
          list.map((a) => ({
            id: a.id,
            name: a.name,
            pid: a.default_pid,
            created: a.created_at.slice(0, 10),
          })),
        );
      } catch (err) {
        die(err instanceof Error ? err.message : String(err));
      }
    });

  agents
    .command("create")
    .description("创建 Agent（同时返回首个 API Key）")
    .requiredOption("-n, --name <name>", "Agent 名称")
    .option("-d, --description <text>", "描述")
    .option("--default-pid <pid>", "默认 process / project id", "default")
    .option("--json", "以 JSON 输出")
    .action(
      async (opts: {
        name: string;
        description?: string;
        defaultPid: string;
        json?: boolean;
      }) => {
        try {
          const data = await apiRequest<{
            agent: AgentRow;
            apiKey: { id: string; prefix: string; raw: string; name: string };
          }>({
            method: "POST",
            path: "/v1/agents",
            auth: "clerk",
            body: {
              name: opts.name,
              description: opts.description ?? "",
              defaultPid: opts.defaultPid,
            },
          });
          saveConfig({
            defaultAgentId: data.agent.id,
            apiKey: data.apiKey.raw,
          });
          if (opts.json) {
            printJson(data);
            return;
          }
          console.log(`已创建 Agent: ${data.agent.name} (${data.agent.id})`);
          console.log(`默认 pid: ${data.agent.default_pid}`);
          console.log(`API Key（仅显示一次）:\n  ${data.apiKey.raw}`);
          console.log("已写入 defaultAgentId 与 apiKey 到本地配置。");
        } catch (err) {
          die(err instanceof Error ? err.message : String(err));
        }
      },
    );

  agents
    .command("get")
    .description("查看单个 Agent")
    .argument("<id>", "Agent id")
    .option("--json", "以 JSON 输出")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const data = await apiRequest<{ agent: AgentRow }>({
          path: `/v1/agents/${encodeURIComponent(id)}`,
          auth: "clerk",
        });
        if (opts.json) {
          printJson(data.agent);
          return;
        }
        printJson(data.agent);
      } catch (err) {
        die(err instanceof Error ? err.message : String(err));
      }
    });

  agents
    .command("delete")
    .description("删除 Agent 及其关联数据")
    .argument("<id>", "Agent id")
    .option("-y, --yes", "跳过确认")
    .action(async (id: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const readline = await import("node:readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer = await new Promise<string>((resolve) => {
          rl.question(`确认删除 Agent ${id}? [y/N] `, resolve);
        });
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("已取消。");
          return;
        }
      }
      try {
        await apiRequest({
          method: "DELETE",
          path: `/v1/agents/${encodeURIComponent(id)}`,
          auth: "clerk",
        });
        const config = loadConfig();
        if (config.defaultAgentId === id) {
          saveConfig({ defaultAgentId: undefined });
        }
        console.log(`已删除 Agent ${id}`);
      } catch (err) {
        die(err instanceof Error ? err.message : String(err));
      }
    });

  agents
    .command("use")
    .description("设置默认 Agent id（memories 命令未指定 --agent 时使用）")
    .argument("<id>", "Agent id")
    .action((id: string) => {
      saveConfig({ defaultAgentId: id.trim() });
      console.log(`默认 Agent 已设为 ${id}`);
    });
}
