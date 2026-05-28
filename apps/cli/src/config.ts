import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Local CLI config stored at ~/.memost/config.json. */
export interface MemostConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  defaultAgentId?: string;
}

/** Local CLI auth data stored at ~/.memost/auth.json. */
export interface MemostAuth {
  oauthAccessToken?: string;
  oauthRefreshToken?: string;
  oauthExpiresAt?: string;
  oauthScope?: string;
  oauthTokenType?: string;
  apiKey?: string;
}

const DEFAULTS: MemostConfig = {
  apiBaseUrl: "https://api.memo.st",
  webBaseUrl: "https://memo.st",
};

function configDir(): string {
  return process.env.MEMOST_HOME ?? path.join(os.homedir(), ".memost");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function loadConfig(): MemostConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<MemostConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(patch: Partial<MemostConfig>): MemostConfig {
  const next = { ...loadConfig(), ...patch };
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath(), `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

export function authPath(): string {
  return path.join(configDir(), "auth.json");
}

export function loadAuth(): MemostAuth {
  try {
    const raw = fs.readFileSync(authPath(), "utf8");
    return JSON.parse(raw) as MemostAuth;
  } catch {
    return {};
  }
}

export function saveAuth(patch: Partial<MemostAuth>): MemostAuth {
  const next = { ...loadAuth(), ...patch };
  writeAuth(next);
  return next;
}

function writeAuth(next: MemostAuth): void {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(authPath(), `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
}

export function clearAuth(): MemostAuth {
  const next = { ...loadAuth() };
  delete next.oauthAccessToken;
  delete next.oauthRefreshToken;
  delete next.oauthExpiresAt;
  delete next.oauthScope;
  delete next.oauthTokenType;
  writeAuth(next);
  return next;
}

export function clearApiKey(): MemostAuth {
  const next = { ...loadAuth() };
  delete next.apiKey;
  writeAuth(next);
  return next;
}
