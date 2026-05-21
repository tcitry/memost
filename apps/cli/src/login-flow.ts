import crypto from "node:crypto";
import http from "node:http";
import { exec } from "node:child_process";
import { loadConfig, saveAuth } from "./config.js";

const CALLBACK_TIMEOUT_MS = 120_000;

function randomUrlSafe(size = 32): string {
  return crypto
    .randomBytes(size)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Start the local callback server and receive the login result from the browser. */
export function startCallbackServer(): Promise<{
  port: number;
  waitForResult: () => Promise<{ token: string; state: string }>;
}> {
  let resolveResult!: (value: { token: string; state: string }) => void;
  let rejectResult!: (err: Error) => void;

  const resultPromise = new Promise<{ token: string; state: string }>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = http.createServer((req, res) => {
    // Allow the web callback page to post the login result back to the local CLI.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/callback") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            token?: string;
            state?: string;
          };
          const token = body.token?.trim();
          const state = body.state?.trim();
          if (!token || !state) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "missing token or state" }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          resolveResult({ token, state });
          server.close();
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "invalid body" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Unable to bind a callback port."));
        return;
      }
      const port = addr.port;
      const timer = setTimeout(() => {
        server.close();
        rejectResult(new Error("Login timed out. Complete sign-in in the browser and try again."));
      }, CALLBACK_TIMEOUT_MS);

      resolve({
        port,
        waitForResult: async () => {
          try {
            const result = await resultPromise;
            clearTimeout(timer);
            return result;
          } catch (err) {
            clearTimeout(timer);
            throw err;
          }
        },
      });
    });
    server.on("error", reject);
  });
}

/** Try to open the browser with a system command. */
export function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {
    // Ignore failures; the user can open it manually.
  });
}

export async function runBrowserLogin(webUrl?: string): Promise<void> {
  const config = loadConfig();
  const webBase = (webUrl ?? config.webBaseUrl).replace(/\/$/, "");
  const state = randomUrlSafe(24);
  const { port, waitForResult } = await startCallbackServer();
  const loginUrl = `${webBase}/cli/login?port=${port}&state=${state}`;

  console.log("Opening the browser to complete sign-in...");
  console.log(`If it does not open automatically, visit:\n  ${loginUrl}\n`);
  openBrowser(loginUrl);

  const result = await waitForResult();
  if (result.state !== state) {
    throw new Error("Login state verification failed. Run memost login again.");
  }
  const token = result.token;
  saveAuth({ clerkToken: token });
  console.log(`Saved session to ${process.env.HOME ?? "~"}/.memost/auth.json`);
}

export function runTokenLogin(token: string): void {
  saveAuth({ clerkToken: token.trim() });
  console.log("Saved Clerk session token.");
}

export function runApiKeyLogin(apiKey: string): void {
  const key = apiKey.trim();
  if (!key.startsWith("mst_")) {
    console.warn("Warning: API keys usually start with mst_test_ or mst_live_.");
  }
  saveAuth({ apiKey: key });
  console.log("Saved agent API key for memory commands.");
}
