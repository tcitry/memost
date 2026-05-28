import { describe, expect, it, vi } from "vitest";
import { generateApiKey, newId, sha256Hex } from "./ids";

describe("id helpers", () => {
  it("creates prefix-based ids without UUID separators", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "12345678-1234-4321-abcd-1234567890ab",
    );

    expect(newId("agent")).toBe("agent_1234567812344321abcd1234567890ab");
  });

  it("hashes input with sha256 hex output", async () => {
    await expect(sha256Hex("memost")).resolves.toBe(
      "34a7df91015e2c1559516ad2d02671613bf38a6960c26e319e3dca9ed7aeca15",
    );
  });

  it("uses environment-specific API key prefixes", async () => {
    await expect(generateApiKey("development")).resolves.toMatchObject({
      raw: expect.stringMatching(/^mst_test_/),
      prefix: expect.stringMatching(/^mst_test_/),
    });
    await expect(generateApiKey("production")).resolves.toMatchObject({
      raw: expect.stringMatching(/^mst_live_/),
      prefix: expect.stringMatching(/^mst_live_/),
    });
  });
});
