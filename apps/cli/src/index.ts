#!/usr/bin/env node

import { Command } from "commander";
import { apiRequest } from "./api.js";
import {
  authPath,
  clearApiKey,
  clearAuth,
  configPath,
  loadAuth,
  loadConfig,
  saveConfig,
} from "./config.js";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerKeysCommand } from "./commands/keys.js";
import { registerMemoriesCommand } from "./commands/memories.js";
import { die, printJson } from "./output.js";
import {
  runApiKeyLogin,
  runBrowserLogin,
  runOAuthRefresh,
  runTokenLogin,
} from "./login-flow.js";

const program = new Command();

program
  .name("memost")
  .description("Memost CLI: Clerk login, agent management, and memory debugging")
  .version("0.1.0");

program
  .command("login")
  .description("Sign in with Clerk OAuth + PKCE and save the session to ~/.memost/auth.json")
  .option("--token <jwt>", "Paste a Clerk JWT manually (skip the browser)")
  .option("--api-key <key>", "Save only an mst_* API key (for memory APIs)")
  .action(async (opts: { token?: string; apiKey?: string }) => {
    try {
      if (opts.apiKey) {
        runApiKeyLogin(opts.apiKey);
        return;
      }
      if (opts.token) {
        runTokenLogin(opts.token);
        return;
      }
      await runBrowserLogin();
    } catch (err) {
      die(err instanceof Error ? err.message : String(err));
    }
  });

program
  .command("logout")
  .description("Clear local authentication data")
  .action(() => {
    clearAuth();
    clearApiKey();
    console.log("Authentication data cleared.");
  });

program
  .command("whoami")
  .description("Check API connectivity and current configuration")
  .action(async () => {
    const config = loadConfig();
    const auth = loadAuth();
    console.log(`config: ${configPath()}`);
    console.log(`auth:   ${authPath()}`);
    console.log(`api:    ${config.apiBaseUrl}`);
    console.log(`web:    ${config.webBaseUrl}`);
    console.log(`oauth:  ${auth.oauthAccessToken ? "yes" : "no"}`);
    console.log(`clerk:  ${auth.clerkToken ? "yes" : "no"}`);
    console.log(`apiKey: ${auth.apiKey ? `${auth.apiKey.slice(0, 16)}…` : "no"}`);
    console.log(`agent:  ${config.defaultAgentId ?? "(unset)"}`);
    try {
      const health = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/health`);
      const json = (await health.json()) as { ok?: boolean; env?: string };
      console.log(`health: ${json.ok ? "ok" : "fail"} (${json.env ?? "?"})`);
    } catch (err) {
      console.log(`health: unreachable (${err instanceof Error ? err.message : err})`);
    }
    if (auth.oauthAccessToken || auth.clerkToken) {
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

const configCmd = program.command("config").description("Local configuration");
const authCmd = program.command("auth").description("Authentication helpers");

authCmd
  .command("refresh")
  .description("Refresh the stored OAuth access token")
  .action(async () => {
    try {
      await runOAuthRefresh();
    } catch (err) {
      die(err instanceof Error ? err.message : String(err));
    }
  });

configCmd
  .command("show")
  .description("Show local configuration (secrets masked)")
  .option("--json", "Full JSON")
  .action((opts: { json?: boolean }) => {
    const c = loadConfig();
    const a = loadAuth();
    const masked = {
      ...c,
      authPath: authPath(),
      oauthAccessToken: a.oauthAccessToken ? "[set]" : undefined,
      oauthRefreshToken: a.oauthRefreshToken ? "[set]" : undefined,
      oauthExpiresAt: a.oauthExpiresAt,
      oauthScope: a.oauthScope,
      clerkToken: a.clerkToken ? "[set]" : undefined,
      apiKey: a.apiKey ? `${a.apiKey.slice(0, 16)}…` : undefined,
    };
    if (opts.json) printJson(masked);
    else printJson(masked);
  });

configCmd
  .command("set")
  .description("Set api-url / web-url")
  .argument("<key>", "api-url | web-url")
  .argument("<value>", "New value")
  .action((key: string, value: string) => {
    if (key === "api-url") saveConfig({ apiBaseUrl: value });
    else if (key === "web-url") saveConfig({ webBaseUrl: value });
    else die(`Unknown key: ${key}. Available keys: api-url, web-url`);
    console.log(`Updated ${key}`);
  });

registerAgentsCommand(program);
registerKeysCommand(program);
registerMemoriesCommand(program);

program.parse();
