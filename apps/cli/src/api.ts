import { loadConfig } from "./config.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  /** 管理接口默认用 Clerk；记忆接口可用 apiKey */
  auth?: "clerk" | "api_key" | "auto";
  agentId?: string;
}

/** 向 Memost API Worker 发起请求 */
export async function apiRequest<T = unknown>(opts: RequestOptions): Promise<T> {
  const config = loadConfig();
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const url = `${base}${opts.path}`;

  const authMode = opts.auth ?? "auto";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (authMode === "clerk" || (authMode === "auto" && opts.path.startsWith("/v1/agents"))) {
    if (!config.clerkToken) {
      throw new ApiError(401, "未登录：请先运行 memost login");
    }
    headers.authorization = `Bearer ${config.clerkToken}`;
  } else if (authMode === "api_key" || (authMode === "auto" && opts.path.startsWith("/v1/memories"))) {
    const key = config.apiKey;
    if (!key) {
      throw new ApiError(401, "未配置 API Key：memost keys use <raw> 或 memost login --api-key");
    }
    headers.authorization = `Bearer ${key}`;
  }

  const agentId = opts.agentId ?? config.defaultAgentId;
  if (agentId) headers["x-agent-id"] = agentId;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) msg = parsed.error;
    } catch {
      // 保留原始文本
    }
    throw new ApiError(res.status, msg || res.statusText);
  }

  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
