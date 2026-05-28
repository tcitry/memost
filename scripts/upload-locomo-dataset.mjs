import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const databaseName =
  process.env.BENCHMARK_D1_DATABASE ??
  process.env.LOCOMO_D1_DATABASE ??
  "memost-std-benchmark-dataset";
const root = repoRoot();
const sqlFile = process.env.LOCOMO_SQL_FILE
  ? resolve(process.env.LOCOMO_SQL_FILE)
  : resolve(root.pathname, "tmp/locomo-dataset/import.sql");
const wranglerCommand = process.env.WRANGLER_BIN;

console.log(`Preparing LoCoMo dataset import into benchmark D1 database: ${databaseName}`);

if (!existsSync(sqlFile)) {
  run("node", ["scripts/build-locomo-dataset-sql.mjs"], repoRoot());
}

const databases = runWranglerJson(["d1", "list"]);
const exists = Array.isArray(databases)
  ? databases.some((database) => database.name === databaseName)
  : false;

if (!exists) {
  runWrangler(["d1", "create", databaseName]);
}

runWrangler(["d1", "execute", databaseName, "--remote", "--file", sqlFile]);
runWrangler([
  "d1",
  "execute",
  databaseName,
  "--remote",
  "--command",
  "select * from locomo_metadata; select count(*) as question_count from locomo_questions; select count(*) as turn_count from locomo_dialogue_turns;",
]);

function run(command, args) {
  return runIn(command, args, repoRoot(), "inherit");
}

function runWrangler(args) {
  if (wranglerCommand) return run(wranglerCommand, args);
  return run("pnpm", ["--filter", "api", "exec", "wrangler", ...args]);
}

function runIn(command, args, cwd, stdio) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/logs" },
    encoding: "utf8",
    stdio,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result;
}

function runWranglerJson(args) {
  const result = wranglerCommand
    ? runIn(wranglerCommand, args.concat("--json"), repoRoot(), ["ignore", "pipe", "inherit"])
    : runIn(
        "pnpm",
        ["--filter", "api", "exec", "wrangler", ...args, "--json"],
        repoRoot(),
        ["ignore", "pipe", "inherit"],
      );
  return JSON.parse(result.stdout);
}

function repoRoot() {
  return new URL("..", import.meta.url);
}
