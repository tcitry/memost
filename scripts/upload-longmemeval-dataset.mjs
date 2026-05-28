import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const databaseName = process.env.BENCHMARK_D1_DATABASE ?? "memost-std-benchmark-dataset";
const root = repoRoot();
const sqlDir = resolve(process.env.LME_SQL_DIR ?? resolve(root.pathname, "tmp/longmemeval-dataset"));
const wranglerCommand = process.env.WRANGLER_BIN;

console.log(`Preparing LongMemEval dataset import into benchmark D1 database: ${databaseName}`);

if (!existsSync(resolve(sqlDir, "manifest.json"))) {
  run("node", ["scripts/build-longmemeval-dataset-sql.mjs"]);
}

const databases = runWranglerJson(["d1", "list"]);
const exists = Array.isArray(databases)
  ? databases.some((database) => database.name === databaseName)
  : false;

if (!exists) {
  runWrangler(["d1", "create", databaseName]);
}

const files = (await readdir(sqlDir)).filter((file) => file.endsWith(".sql")).sort();
for (const file of files) {
  console.log(`Importing ${file} into ${databaseName}`);
  runWrangler(["d1", "execute", databaseName, "--remote", "--file", resolve(sqlDir, file)]);
}

runWrangler([
  "d1",
  "execute",
  databaseName,
  "--remote",
  "--command",
  [
    "select * from lme_metadata;",
    "select variant, count(*) as question_count from lme_questions group by variant;",
    "select count(*) as session_count from lme_sessions;",
    "select * from lme_v2_metadata;",
    "select count(*) as question_count from lme_v2_questions;",
    "select tier, count(*) as haystack_count from lme_v2_haystacks group by tier;",
    "select count(*) as trajectory_count from lme_v2_trajectories;",
  ].join(" "),
]);

const manifest = JSON.parse(await readFile(resolve(sqlDir, "manifest.json"), "utf8"));
console.log(JSON.stringify(manifest, null, 2));

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
