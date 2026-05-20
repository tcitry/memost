import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { loadConfig, saveConfig } from "../config.js";
import { die, printJson, printTable } from "../output.js";

interface ApiKeyRow {
  id: string;
  agent_id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function registerKeysCommand(program: Command): void {
  const keys = program.command("keys").description("管理 Agent API Key（需 Clerk 登录）");

  keys
    .command("list")
    .description("列出某 Agent 的 API Key")
    .requiredOption("-a, --agent <id>", "Agent id")
    .option("--json", "以 JSON 输出")
    .action(async (opts: { agent: string; json?: boolean }) => {
      try {
        const data = await apiRequest<{ keys: ApiKeyRow[] }>({
          path: `/v1/agents/${encodeURIComponent(opts.agent)}/keys`,
          auth: "clerk",
        });
        const list = data.keys ?? [];
        if (opts.json) {
          printJson(list);
          return;
        }
        printTable(
          list.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            revoked: k.revoked_at ? "yes" : "no",
            last_used: k.last_used_at?.slice(0, 10) ?? "-",
          })),
        );
      } catch (err) {
        die(err instanceof Error ? err.message : String(err));
      }
    });

  keys
    .command("create")
    .description("为 Agent 创建新 API Key")
    .requiredOption("-a, --agent <id>", "Agent id")
    .option("-n, --name <name>", "Key 名称", "default")
    .option("--json", "以 JSON 输出")
    .action(async (opts: { agent: string; name: string; json?: boolean }) => {
      try {
        const data = await apiRequest<{
          id: string;
          prefix: string;
          raw: string;
          name: string;
        }>({
          method: "POST",
          path: `/v1/agents/${encodeURIComponent(opts.agent)}/keys`,
          auth: "clerk",
          body: { name: opts.name },
        });
        if (opts.json) {
          printJson(data);
          return;
        }
        console.log(`新 API Key（仅显示一次）:\n  ${data.raw}`);
      } catch (err) {
        die(err instanceof Error ? err.message : String(err));
      }
    });

  keys
    .command("revoke")
    .description("吊销 API Key")
    .requiredOption("-a, --agent <id>", "Agent id")
    .argument("<keyId>", "Key id")
    .action(async (keyId: string, opts: { agent: string }) => {
      try {
        await apiRequest({
          method: "DELETE",
          path: `/v1/agents/${encodeURIComponent(opts.agent)}/keys/${encodeURIComponent(keyId)}`,
          auth: "clerk",
        });
        console.log(`已吊销 Key ${keyId}`);
      } catch (err) {
        die(err instanceof Error ? err.message : String(err));
      }
    });

  keys
    .command("use")
    .description("将 raw API Key 写入本地配置（供 memories 使用）")
    .argument("<raw>", "mst_test_* 或 mst_live_*")
    .action((raw: string) => {
      saveConfig({ apiKey: raw.trim() });
      console.log("已保存 apiKey 到 ~/.memost/config.json");
    });
}
