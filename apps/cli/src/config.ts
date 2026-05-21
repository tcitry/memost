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
  clerkToken?: string;
  apiKey?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".memost");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const AUTH_PATH = path.join(CONFIG_DIR, "auth.json");

const DEFAULTS: MemostConfig = {
  apiBaseUrl: "http://127.0.0.1:8787",
  webBaseUrl: "http://localhost:3000",
};

export function configPath(): string {
  return CONFIG_PATH;
}

export function loadConfig(): MemostConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<MemostConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(patch: Partial<MemostConfig>): MemostConfig {
  const next = { ...loadConfig(), ...patch };
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

export function authPath(): string {
  return AUTH_PATH;
}

export function loadAuth(): MemostAuth {
  try {
    const raw = fs.readFileSync(AUTH_PATH, "utf8");
    return JSON.parse(raw) as MemostAuth;
  } catch {
    return {};
  }
}

export function saveAuth(patch: Partial<MemostAuth>): MemostAuth {
  const next = { ...loadAuth(), ...patch };
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(AUTH_PATH, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

export function clearAuth(): MemostAuth {
  const current = loadAuth();
  const { clerkToken: _removed, ...rest } = current;
  return saveAuth(rest);
}

export function clearApiKey(): MemostAuth {
  const current = loadAuth();
  const { apiKey: _removed, ...rest } = current;
  return saveAuth(rest);
}
