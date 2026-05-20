import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 本地 CLI 配置，保存在 ~/.memost/config.json */
export interface MemostConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  /** Clerk 会话 JWT，用于 /v1/agents 等管理接口 */
  clerkToken?: string;
  /** Agent API Key（mst_*），用于 /v1/memories */
  apiKey?: string;
  defaultAgentId?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".memost");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

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

export function clearClerkToken(): MemostConfig {
  const current = loadConfig();
  const { clerkToken: _removed, ...rest } = current;
  return saveConfig(rest as MemostConfig);
}
