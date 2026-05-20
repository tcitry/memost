// Lightweight ID helpers. Worker runtime exposes crypto.randomUUID and
// crypto.subtle for hashing. We avoid any third-party id libraries.

const RAW_TOKEN_BYTES = 32;
const TOKEN_PREFIX = "mst_live_";
const TEST_TOKEN_PREFIX = "mst_test_";

function bytesToBase62(bytes: Uint8Array): string {
  // Hex is fine for our purposes; high entropy and URL-safe.
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function newAgentId(): string {
  return newId("agent");
}

export function newMemoryId(): string {
  return newId("mem");
}

export function newTripleId(): string {
  return newId("kg");
}

export function newApiKeyId(): string {
  return newId("key");
}

export interface RawApiKey {
  raw: string;
  prefix: string;
  hash: string;
}

export async function generateApiKey(env: "production" | "development"): Promise<RawApiKey> {
  const buf = new Uint8Array(RAW_TOKEN_BYTES);
  crypto.getRandomValues(buf);
  const tokenBody = bytesToBase62(buf);
  const raw = `${env === "production" ? TOKEN_PREFIX : TEST_TOKEN_PREFIX}${tokenBody}`;
  const prefix = raw.slice(0, 16);
  const hash = await sha256Hex(raw);
  return { raw, prefix, hash };
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase62(new Uint8Array(digest));
}
