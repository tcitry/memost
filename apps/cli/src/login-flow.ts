import crypto from "node:crypto";
import http from "node:http";
import { exec } from "node:child_process";
import { loadAuth, saveAuth } from "./config.js";

const CALLBACK_TIMEOUT_MS = 120_000;
const DEFAULT_AUTHORIZE_URL =
  "https://sharp-bird-46.clerk.accounts.dev/oauth/authorize";
const DEFAULT_TOKEN_URL = "https://sharp-bird-46.clerk.accounts.dev/oauth/token";
const DEFAULT_SCOPES = "email offline_access profile";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:14587/callback";

interface OAuthConfig {
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
  redirectUri: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

function oauthConfig(): OAuthConfig {
  return {
    clientId: process.env.MEMOST_CLI_OAUTH_CLIENT_ID ?? "",
    authorizeUrl:
      process.env.MEMOST_CLI_OAUTH_AUTHORIZE_URL ?? DEFAULT_AUTHORIZE_URL,
    tokenUrl: process.env.MEMOST_CLI_OAUTH_TOKEN_URL ?? DEFAULT_TOKEN_URL,
    scopes: process.env.MEMOST_CLI_OAUTH_SCOPES ?? DEFAULT_SCOPES,
    redirectUri:
      process.env.MEMOST_CLI_OAUTH_REDIRECT_URI ?? DEFAULT_REDIRECT_URI,
  };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomUrlSafe(size = 32): string {
  return base64Url(crypto.randomBytes(size));
}

function pkceChallenge(verifier: string): string {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

function redirectPort(redirectUri: string): number {
  const url = new URL(redirectUri);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("OAuth redirect URI must use localhost or 127.0.0.1.");
  }
  if (!url.port) {
    throw new Error("OAuth redirect URI must include an explicit port.");
  }
  return Number(url.port);
}

function callbackPage(
  status: "success" | "error",
  title: string,
  message: string,
): string {
  const color = status === "success" ? "#244c37" : "#8f2d2d";
  const bg = status === "success" ? "#eff7f1" : "#fff1f1";
  const icon = status === "success" ? "✓" : "!";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | Memost CLI</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f5ef;
        color: #132018;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
        background:
          radial-gradient(circle at 22% 18%, rgba(58, 127, 87, 0.18), transparent 30rem),
          linear-gradient(180deg, #fbfaf6 0%, #eef2ec 100%);
      }
      main {
        width: min(100%, 520px);
        border: 1px solid rgba(31, 57, 42, 0.14);
        border-radius: 18px;
        background: rgba(255, 254, 249, 0.86);
        box-shadow: 0 24px 80px rgba(18, 35, 25, 0.14);
        padding: 36px;
        text-align: center;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 28px;
        font-weight: 750;
      }
      .mark {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: #244c37;
        color: #f7f5ef;
      }
      .status {
        display: grid;
        place-items: center;
        width: 64px;
        height: 64px;
        margin: 0 auto 22px;
        border-radius: 999px;
        background: ${bg};
        color: ${color};
        font-size: 32px;
        font-weight: 800;
      }
      h1 {
        margin: 0;
        font-size: clamp(28px, 6vw, 40px);
        line-height: 1;
        letter-spacing: 0;
      }
      p {
        margin: 16px auto 0;
        max-width: 390px;
        color: #415548;
        font-size: 16px;
        line-height: 1.6;
      }
      .hint {
        margin-top: 26px;
        border-radius: 12px;
        background: rgba(31, 57, 42, 0.06);
        padding: 12px 14px;
        color: #54665a;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand"><span class="mark">m</span><span>Memost CLI</span></div>
      <div class="status" aria-hidden="true">${icon}</div>
      <h1>${title}</h1>
      <p>${message}</p>
      <div class="hint">You can close this tab and return to your terminal.</div>
    </main>
  </body>
</html>`;
}

/** Start the local OAuth callback server and receive the authorization code. */
export function startCallbackServer(redirectUri: string): Promise<{
  waitForCode: () => Promise<{ code: string; state: string }>;
}> {
  let resolveCode!: (value: { code: string; state: string }) => void;
  let rejectCode!: (err: Error) => void;

  const codePromise = new Promise<{ code: string; state: string }>(
    (resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    },
  );

  const redirect = new URL(redirectUri);
  const callbackPath = redirect.pathname || "/callback";
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url?.startsWith(callbackPath)) {
      const url = new URL(req.url, redirectUri);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      if (error) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end(
          callbackPage(
            "error",
            "Login failed",
            errorDescription || "The OAuth provider returned an error.",
          ),
        );
        rejectCode(new Error(errorDescription || error));
        server.close();
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end(
          callbackPage(
            "error",
            "Missing callback data",
            "The OAuth callback did not include the required code and state parameters.",
          ),
        );
        return;
      }

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        callbackPage(
          "success",
          "Login complete",
          "Memost CLI received the authorization code and is finishing setup locally.",
        ),
      );
      resolveCode({ code, state });
      server.close();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve, reject) => {
    const port = redirectPort(redirectUri);
    server.listen(port, redirect.hostname, () => {
      const timer = setTimeout(() => {
        server.close();
        rejectCode(new Error("Login timed out. Complete sign-in in the browser and try again."));
      }, CALLBACK_TIMEOUT_MS);

      resolve({
        waitForCode: async () => {
          try {
            const result = await codePromise;
            clearTimeout(timer);
            return result;
          } catch (err) {
            clearTimeout(timer);
            throw err;
          }
        },
      });
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `OAuth callback port ${redirectPort(redirectUri)} is already in use. Stop the process using it or set MEMOST_CLI_OAUTH_REDIRECT_URI to another registered callback URL.`,
          ),
        );
        return;
      }
      reject(err);
    });
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

async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(
      json.error_description || json.error || "OAuth token exchange failed.",
    );
  }
  return json;
}

async function refreshToken(
  config: OAuthConfig,
  refreshTokenValue: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: refreshTokenValue,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(
      json.error_description || json.error || "OAuth token refresh failed.",
    );
  }
  return json;
}

export async function refreshOAuthSession(): Promise<void> {
  const auth = loadAuth();
  if (!auth.oauthRefreshToken) {
    throw new Error("No OAuth refresh token is stored.");
  }
  const config = oauthConfig();
  const token = await refreshToken(config, auth.oauthRefreshToken);
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : undefined;
  saveAuth({
    oauthAccessToken: token.access_token,
    oauthRefreshToken: token.refresh_token ?? auth.oauthRefreshToken,
    oauthExpiresAt: expiresAt,
    oauthScope: token.scope ?? auth.oauthScope,
    oauthTokenType: token.token_type ?? auth.oauthTokenType,
  });
}

export async function runOAuthRefresh(): Promise<void> {
  await refreshOAuthSession();
  console.log("OAuth session refreshed.");
}

export async function runBrowserLogin(): Promise<void> {
  const config = oauthConfig();
  if (!config.clientId) {
    throw new Error(
      "Missing MEMOST_CLI_OAUTH_CLIENT_ID. Set it in your shell or .env file before running memost login.",
    );
  }
  const state = randomUrlSafe(24);
  const codeVerifier = randomUrlSafe(64);
  const codeChallenge = pkceChallenge(codeVerifier);
  const { waitForCode } = await startCallbackServer(config.redirectUri);

  const authUrl = new URL(config.authorizeUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("scope", config.scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("Opening the browser to complete sign-in...");
  console.log(`If it does not open automatically, visit:\n  ${authUrl.toString()}\n`);
  openBrowser(authUrl.toString());

  const result = await waitForCode();
  if (result.state !== state) {
    throw new Error("Login state verification failed. Run memost login again.");
  }

  const token = await exchangeCodeForToken(config, result.code, codeVerifier);
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : undefined;

  saveAuth({
    oauthAccessToken: token.access_token,
    oauthRefreshToken: token.refresh_token,
    oauthExpiresAt: expiresAt,
    oauthScope: token.scope,
    oauthTokenType: token.token_type,
    clerkToken: undefined,
  });
  console.log("Signed in with OAuth + PKCE.");
  console.log(`${token.refresh_token ? "Saved refresh token and access token" : "Saved access token"} to ~/.memost/auth.json`);
}

export function runTokenLogin(token: string): void {
  saveAuth({ clerkToken: token.trim(), oauthAccessToken: undefined });
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
