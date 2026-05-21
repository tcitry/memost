/** Terminal output helpers. */

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(rows: Record<string, string>[]): void {
  if (rows.length === 0) {
    console.log("(empty)");
    return;
  }
  const keys = Object.keys(rows[0] ?? {});
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => (r[k] ?? "").length)),
  );
  const header = keys.map((k, i) => k.padEnd(widths[i] ?? k.length)).join("  ");
  console.log(header);
  console.log(keys.map((_, i) => "-".repeat(widths[i] ?? 0)).join("  "));
  for (const row of rows) {
    console.log(keys.map((k, i) => (row[k] ?? "").padEnd(widths[i] ?? 0)).join("  "));
  }
}

export function die(message: string, code = 1): never {
  console.error(`error: ${message}`);
  process.exit(code);
}
