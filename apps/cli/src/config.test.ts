import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authPath,
  clearApiKey,
  clearAuth,
  configPath,
  loadAuth,
  loadConfig,
  saveAuth,
  saveConfig,
} from "./config.js";

describe("cli config", () => {
  let memostHome: string;

  beforeEach(() => {
    memostHome = fs.mkdtempSync(path.join(os.tmpdir(), "memost-test-"));
    process.env.MEMOST_HOME = memostHome;
  });

  afterEach(() => {
    delete process.env.MEMOST_HOME;
    fs.rmSync(memostHome, { force: true, recursive: true });
  });

  it("uses production defaults when no config file exists", () => {
    expect(loadConfig()).toEqual({
      apiBaseUrl: "https://api.memo.st",
      webBaseUrl: "https://memo.st",
    });
  });

  it("saves config and auth separately", () => {
    saveConfig({ apiBaseUrl: "http://127.0.0.1:8787" });
    saveAuth({ apiKey: "mst_test_key", oauthAccessToken: "oauth-token" });

    expect(configPath()).toBe(path.join(memostHome, "config.json"));
    expect(authPath()).toBe(path.join(memostHome, "auth.json"));
    expect(loadConfig()).toMatchObject({
      apiBaseUrl: "http://127.0.0.1:8787",
      webBaseUrl: "https://memo.st",
    });
    expect(loadAuth()).toEqual({
      apiKey: "mst_test_key",
      oauthAccessToken: "oauth-token",
    });
  });

  it("clears oauth credentials without removing the API key", () => {
    saveAuth({
      apiKey: "mst_test_key",
      oauthAccessToken: "oauth-token",
      oauthRefreshToken: "refresh-token",
    });

    expect(clearAuth()).toEqual({ apiKey: "mst_test_key" });
  });

  it("clears the API key without removing oauth credentials", () => {
    saveAuth({
      apiKey: "mst_test_key",
      oauthAccessToken: "oauth-token",
    });

    expect(clearApiKey()).toEqual({ oauthAccessToken: "oauth-token" });
  });
});
