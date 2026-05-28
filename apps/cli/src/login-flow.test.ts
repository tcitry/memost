import { describe, expect, it } from "vitest";
import { inferApiBaseUrl } from "./login-flow.js";

describe("inferApiBaseUrl", () => {
  it("maps production and dev web hosts to their API hosts", () => {
    expect(inferApiBaseUrl("https://memo.st")).toBe("https://api.memo.st");
    expect(inferApiBaseUrl("https://memost.iuvdev.com")).toBe(
      "https://memost-api.iuvdev.com",
    );
  });

  it("maps localhost web URLs to the local API worker", () => {
    expect(inferApiBaseUrl("http://localhost:3000/dashboard")).toBe(
      "http://127.0.0.1:8787",
    );
    expect(inferApiBaseUrl("127.0.0.1:3000")).toBe("http://127.0.0.1:8787");
  });

  it("derives API hosts for custom domains", () => {
    expect(inferApiBaseUrl("https://memost.example.com/app")).toBe(
      "https://memost-api.example.com",
    );
    expect(inferApiBaseUrl("https://example.com")).toBe(
      "https://api.example.com",
    );
  });
});
