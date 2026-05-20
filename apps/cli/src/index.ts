#!/usr/bin/env node

import { Command } from "commander";
import { apiRequest } from "./api.js";
import { clearClerkToken, configPath, loadConfig, saveConfig } from "./config.js";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerKeysCommand } from "./commands/keys.js";
import { registerMemoriesCommand } from "./commands/memories.js";
import { die, printJson } from "./output.js";
import {
  runApiKeyLogin,
  runBrowserLogin,
  runTokenLogin,
} from "./login-flow.js";

const program = new Command();

program
  .name("memost")
  .description("Memost 命令行工具：Clerk 登录、Agent 与记忆调试")
  .version("0.1.0");

program
  .command("login")
  .description("通过浏览器 Clerk 登录，保存会话到 ~/.memost/config.json")
  .option("--web-url <url>", "Dashboard 地址", loadConfig().webBaseUrl)
  .option("--token <jwt>", "手动粘贴 Clerk JWT（跳过浏览器）")
  .option("--api-key <key>", "仅保存 mst_* API Key（记忆接口）")
  .action(async (opts: { webUrl: string; token?: string; apiKey?: string }) => {
    try {
      if (opts.apiKey) {
        runApiKeyLogin(opts.apiKey);
        return;
      }
      if (opts.token) {
        runTokenLogin(opts.token);
        return;
      }
      await runBrowserLogin(opts.webUrl);
    } catch (err) {
      die(err instanceof Error ? err.message : String(err));
    }
  });

program
  .command("logout")
  .description("清除本地 Clerk 会话")
  .action(() => {
    clearClerkToken();
    console.log("已清除 clerkToken。");
  });

program
  .command("whoami")
  .description("检查 API 连通性与当前配置")
  .action(async () => {
    const config = loadConfig();
    console.log(`config: ${configPath()}`);
    console.log(`api:    ${config.apiBaseUrl}`);
    console.log(`web:    ${config.webBaseUrl}`);
    console.log(`clerk:  ${config.clerkToken ? "yes" : "no"}`);
    console.log(`apiKey: ${config.apiKey ? `${config.apiKey.slice(0, 16)}…` : "no"}`);
    console.log(`agent:  ${config.defaultAgentId ?? "(unset)"}`);
    try {
      const health = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/health`);
      const json = (await health.json()) as { ok?: boolean; env?: string };
      console.log(`health: ${json.ok ? "ok" : "fail"} (${json.env ?? "?"})`);
    } catch (err) {
      console.log(`health: unreachable (${err instanceof Error ? err.message : err})`);
    }
    if (config.clerkToken) {
      try {
        const data = await apiRequest<{ agents: unknown[] }>({
          path: "/v1/agents",
          auth: "clerk",
        });
        console.log(`agents: ${(data.agents ?? []).length} accessible`);
      } catch (err) {
        console.log(
          `agents: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });

const configCmd = program.command("config").description("本地配置");

configCmd
  .command("show")
  .description("显示配置（脱敏）")
  .option("--json", "完整 JSON")
  .action((opts: { json?: boolean }) => {
    const c = loadConfig();
    const masked = {
      ...c,
      clerkToken: c.clerkToken ? "[set]" : undefined,
      apiKey: c.apiKey ? `${c.apiKey.slice(0, 16)}…` : undefined,
    };
    if (opts.json) printJson(masked);
    else printJson(masked);
  });

configCmd
  .command("set")
  .description("设置 api-url / web-url")
  .argument("<key>", "api-url | web-url")
  .argument("<value>", "新值")
  .action((key: string, value: string) => {
    if (key === "api-url") saveConfig({ apiBaseUrl: value });
    else if (key === "web-url") saveConfig({ webBaseUrl: value });
    else die(`未知键: ${key}，可用 api-url、web-url`);
    console.log(`已更新 ${key}`);
  });

registerAgentsCommand(program);
registerKeysCommand(program);
registerMemoriesCommand(program);

program.parse();
