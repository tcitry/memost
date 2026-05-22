// Server-side helper that proxies authenticated requests from the
// dashboard worker to the memo.st API worker. The Clerk JWT is
// forwarded as a Bearer token; the API worker re-verifies it with Clerk, so we
// don't need shared secrets between workers.

import { auth } from "@clerk/tanstack-react-start/server";

export interface ApiCallOptions {
  method?: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  agentId?: string;
}

export class ApiCallError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function callApi<T = unknown>(opts: ApiCallOptions): Promise<T> {
  const session = await auth();
  if (!session?.userId) {
    throw new ApiCallError(401, "Authentication required");
  }
  const token = await session.getToken();
  if (!token) throw new ApiCallError(401, "Could not mint Clerk token");

  const baseUrl =
    (typeof process !== "undefined" && process.env?.API_BASE_URL) ||
    "http://127.0.0.1:8787";
  const url = `${baseUrl.replace(/\/$/, "")}${opts.path}`;

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  if (opts.agentId) headers["x-agent-id"] = opts.agentId;

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
      // keep raw text
    }
    throw new ApiCallError(res.status, msg || res.statusText);
  }

  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}
