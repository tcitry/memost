import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { saveAuth } from "../config.js";
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
  const keys = program.command("keys").description("Manage agent API keys (Clerk login required)");

  keys
    .command("list")
    .description("List API keys for an agent")
    .requiredOption("-a, --agent <id>", "Agent id")
    .option("--json", "Output JSON")
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
    .description("Create a new API key for an agent")
    .requiredOption("-a, --agent <id>", "Agent id")
    .option("-n, --name <name>", "Key name", "default")
    .option("--json", "Output JSON")
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
        console.log(`New API key (shown once):\n  ${data.raw}`);
      } catch (err) {
        die(err instanceof Error ? err.message : String(err));
      }
    });

  keys
    .command("revoke")
    .description("Revoke an API key")
    .requiredOption("-a, --agent <id>", "Agent id")
    .argument("<keyId>", "Key id")
    .action(async (keyId: string, opts: { agent: string }) => {
      try {
        await apiRequest({
          method: "DELETE",
          path: `/v1/agents/${encodeURIComponent(opts.agent)}/keys/${encodeURIComponent(keyId)}`,
          auth: "clerk",
        });
        console.log(`Revoked key ${keyId}`);
      } catch (err) {
        die(err instanceof Error ? err.message : String(err));
      }
    });

  keys
    .command("use")
    .description("Save a raw API key locally for memory commands")
    .argument("<raw>", "mst_test_* or mst_live_*")
    .action((raw: string) => {
      saveAuth({ apiKey: raw.trim() });
      console.log("Saved apiKey to ~/.memost/auth.json");
    });
}
