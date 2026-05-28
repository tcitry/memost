import { loadAuth, loadConfig } from "./config.js";
import { refreshOAuthSession } from "./login-flow.js";

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
  /** Management endpoints use Clerk by default; memory endpoints can use apiKey. */
  auth?: "clerk" | "api_key" | "auto";
  agentId?: string;
}

/** Send a request to the Memost API worker. */
export async function apiRequest<T = unknown>(opts: RequestOptions): Promise<T> {
  const config = loadConfig();
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const url = `${base}${opts.path}`;
  let auth = loadAuth();

  const authMode = opts.auth ?? "auto";
  const useClerkAuth =
    authMode === "clerk" ||
    (authMode === "auto" && opts.path.startsWith("/v1/agents"));

  if (useClerkAuth && shouldRefreshOAuth(auth)) {
    await refreshOAuthSession();
    auth = loadAuth();
  }

  const headers = buildHeaders(opts, auth);
  let res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && useClerkAuth && auth.oauthRefreshToken) {
    await refreshOAuthSession();
    auth = loadAuth();
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: buildHeaders(opts, auth),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  }

  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) msg = parsed.error;
    } catch {
      // Keep the original text.
    }
    throw new ApiError(res.status, msg || res.statusText);
  }

  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function buildHeaders(
  opts: RequestOptions,
  auth: ReturnType<typeof loadAuth>,
): Record<string, string> {
  const config = loadConfig();
  const authMode = opts.auth ?? "auto";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (
    authMode === "clerk" ||
    (authMode === "auto" && opts.path.startsWith("/v1/agents"))
  ) {
    const token = auth.oauthAccessToken;
    if (!token) {
      throw new ApiError(401, "Not signed in. Run memost login first.");
    }
    headers.authorization = `Bearer ${token}`;
  } else if (authMode === "api_key" || (authMode === "auto" && opts.path.startsWith("/v1/memories"))) {
    const key = auth.apiKey;
    if (!key) {
      throw new ApiError(401, "No API key configured. Run memost keys use <raw> or memost login --api-key.");
    }
    headers.authorization = `Bearer ${key}`;
  }

  const agentId = opts.agentId ?? config.defaultAgentId;
  if (agentId) headers["x-agent-id"] = agentId;

  return headers;
}

function shouldRefreshOAuth(auth: ReturnType<typeof loadAuth>): boolean {
  if (!auth.oauthRefreshToken || !auth.oauthExpiresAt) return false;
  const expiresAt = Date.parse(auth.oauthExpiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt - Date.now() < 60_000;
}
