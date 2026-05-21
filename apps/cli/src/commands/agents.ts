import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { loadConfig, saveConfig, saveAuth } from "../config.js";
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
  const agents = program.command("agents").description("Manage agents (Clerk login required)");

  agents
    .command("list")
    .description("List all agents for the current organization or user")
    .option("--json", "Output JSON")
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
    .description("Create an agent and return its first API key")
    .requiredOption("-n, --name <name>", "Agent name")
    .option("-d, --description <text>", "Description")
    .option("--default-pid <pid>", "Default process / project id", "default")
    .option("--json", "Output JSON")
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
          });
          saveAuth({ apiKey: data.apiKey.raw });
          if (opts.json) {
            printJson(data);
            return;
          }
          console.log(`Created agent: ${data.agent.name} (${data.agent.id})`);
          console.log(`Default pid: ${data.agent.default_pid}`);
          console.log(`API key (shown once):\n  ${data.apiKey.raw}`);
          console.log("Saved defaultAgentId. The API key was written to ~/.memost/auth.json.");
        } catch (err) {
          die(err instanceof Error ? err.message : String(err));
        }
      },
    );

  agents
    .command("get")
    .description("Show a single agent")
    .argument("<id>", "Agent id")
    .option("--json", "Output JSON")
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
    .description("Delete an agent and its related data")
    .argument("<id>", "Agent id")
    .option("-y, --yes", "Skip confirmation")
    .action(async (id: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const readline = await import("node:readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer = await new Promise<string>((resolve) => {
          rl.question(`Delete agent ${id}? [y/N] `, resolve);
        });
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Cancelled.");
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
        console.log(`Deleted agent ${id}`);
      } catch (err) {
        die(err instanceof Error ? err.message : String(err));
      }
    });

  agents
    .command("use")
    .description("Set the default agent id used by memories commands when --agent is omitted")
    .argument("<id>", "Agent id")
    .action((id: string) => {
      saveConfig({ defaultAgentId: id.trim() });
      console.log(`Default agent set to ${id}`);
    });
}
