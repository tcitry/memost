import type { Context } from "hono";

export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 401 | 404 | 409 | 422 | 500,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(c: Context, error: unknown) {
  if (error instanceof HttpError) {
    return c.json({ error: error.message }, error.status);
  }

  console.error(
    JSON.stringify({
      level: "error",
      message: "unhandled_request_error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );

  return c.json({ error: "Internal server error" }, 500);
}

export async function readJson<T>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new HttpError(400, "Expected a valid JSON request body");
  }
}
