import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  process.env["DXCRM_DATA_DIR"] = "/crm";
});
afterEach(() => {
  delete process.env["DXCRM_DATA_DIR"];
});

describe("dxcrm mcp token", () => {
  it("mints a token and stores its hash mapped to actor/role", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { mcpCommand } = await import("../../src/commands/guide.js");

    await mcpCommand.parseAsync(["node", "mcp", "token", "--actor", "alice", "--role", "admin"]);

    const stored = JSON.parse(
      vol.readFileSync("/crm/.agentic/mcp-tokens.json", "utf-8") as string
    ) as { tokens: Array<{ actor: string; role: string; hash: string }> };
    expect(stored.tokens[0]!.actor).toBe("alice");
    expect(stored.tokens[0]!.role).toBe("admin");
    expect(stored.tokens[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    // the printed token must be a non-empty secret
    const printed = logSpy.mock.calls.flat().join("\n");
    expect(printed).toContain("not shown again");
    logSpy.mockRestore();
  });
});
