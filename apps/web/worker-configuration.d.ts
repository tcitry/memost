interface D1Result<T = unknown> {
  results?: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  MEMOST_ENV: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  API_BASE_URL: string;
  BENCHMARK_DATASET_DB: D1Database;
}

declare namespace Cloudflare {
  interface Env {
    MEMOST_ENV: string;
    CLERK_PUBLISHABLE_KEY?: string;
    CLERK_SECRET_KEY?: string;
    API_BASE_URL: string;
    BENCHMARK_DATASET_DB: D1Database;
  }
}

declare module "cloudflare:workers" {
  export const env: Env;
}
