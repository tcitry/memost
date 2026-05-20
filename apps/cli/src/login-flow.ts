import http from "node:http";
import { exec } from "node:child_process";
import { loadConfig, saveConfig } from "./config.js";

const CALLBACK_TIMEOUT_MS = 120_000;

/** 启动本地回调服务，接收浏览器回传的 Clerk JWT */
export function startCallbackServer(): Promise<{
  port: number;
  waitForToken: () => Promise<string>;
}> {
  let resolveToken!: (token: string) => void;
  let rejectToken!: (err: Error) => void;

  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  const server = http.createServer((req, res) => {
    // 允许 dashboard 本地页面向回调 POST
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
          };
          if (!body.token?.trim()) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "missing token" }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          resolveToken(body.token.trim());
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
        reject(new Error("无法绑定回调端口"));
        return;
      }
      const port = addr.port;
      const timer = setTimeout(() => {
        server.close();
        rejectToken(new Error("登录超时：请在浏览器完成登录后重试"));
      }, CALLBACK_TIMEOUT_MS);

      resolve({
        port,
        waitForToken: async () => {
          try {
            const token = await tokenPromise;
            clearTimeout(timer);
            return token;
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

/** 尝试用系统命令打开浏览器 */
export function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {
    // 忽略失败，用户可手动打开
  });
}

export async function runBrowserLogin(webUrl?: string): Promise<void> {
  const config = loadConfig();
  const webBase = (webUrl ?? config.webBaseUrl).replace(/\/$/, "");
  const { port, waitForToken } = await startCallbackServer();
  const loginUrl = `${webBase}/cli/login?port=${port}`;

  console.log("正在打开浏览器完成 Clerk 登录…");
  console.log(`若未自动打开，请访问：\n  ${loginUrl}\n`);
  openBrowser(loginUrl);

  const token = await waitForToken();
  saveConfig({ clerkToken: token });
  console.log(`已保存会话到 ${process.env.HOME ?? "~"}/.memost/config.json`);
}

export function runTokenLogin(token: string): void {
  saveConfig({ clerkToken: token.trim() });
  console.log("已保存 Clerk 会话令牌。");
}

export function runApiKeyLogin(apiKey: string): void {
  const key = apiKey.trim();
  if (!key.startsWith("mst_")) {
    console.warn("警告：API Key 通常以 mst_test_ 或 mst_live_ 开头");
  }
  saveConfig({ apiKey: key });
  console.log("已保存 Agent API Key（用于 memories 命令）。");
}
