import { describe, expect, it } from "vitest";
import { buildMemoryScope } from "./scope";
import type { AgentRow } from "./types";

const agent: AgentRow = {
  id: "agent_123",
  owner_id: "user_123",
  name: "Default agent",
  description: "",
  default_pid: "main",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("buildMemoryScope", () => {
  it("uses agent defaults when optional scope fields are missing", () => {
    expect(buildMemoryScope({ agent, ownerId: "user_123" })).toEqual({
      ownerId: "user_123",
      agent,
      pid: "main",
      tid: null,
      subjectId: "user_123",
      namespace: "main",
    });
  });

  it("builds the default namespace from pid and tid", () => {
    expect(
      buildMemoryScope({
        agent,
        ownerId: "user_123",
        pid: "profile",
        tid: "session-1",
        subjectId: "subject_123",
      }),
    ).toMatchObject({
      pid: "profile",
      tid: "session-1",
      subjectId: "subject_123",
      namespace: "profile/session-1",
    });
  });

  it("preserves an explicit namespace", () => {
    expect(
      buildMemoryScope({
        agent,
        ownerId: "user_123",
        namespace: "custom",
      }).namespace,
    ).toBe("custom");
  });
});
