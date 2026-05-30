import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAgentSpawn", () => {
  it("creates agent config in .agentic/agents/", async () => {
    vol.fromJSON({ "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n" });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAgentSpawn } = await import("../../src/commands/agent.js");

    await runAgentSpawn("acme-corp", { channel: "telegram" }, "/crm");

    const configPath = "/crm/.agentic/agents/acme-corp.agent.json";
    expect(vol.existsSync(configPath)).toBe(true);

    const config = JSON.parse(vol.readFileSync(configPath, "utf-8") as string) as Record<
      string,
      unknown
    >;
    expect(config["slug"]).toBe("acme-corp");
    expect(config["channel"]).toBe("telegram");
    expect(config["lastWake"]).toBeNull();
    expect(Array.isArray(config["wakeOn"])).toBe(true);

    consoleSpy.mockRestore();
  });

  it("exits with error when customer not found", async () => {
    vol.fromJSON({});

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    const { runAgentSpawn } = await import("../../src/commands/agent.js");
    await expect(runAgentSpawn("unknown-corp", {}, "/crm")).rejects.toThrow("process.exit called");

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("includes telegramChatId when --chat-id provided", async () => {
    vol.fromJSON({ "/crm/customers/beta-gmbh/main_facts.md": "---\nname: Beta\n---\n" });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAgentSpawn } = await import("../../src/commands/agent.js");

    await runAgentSpawn("beta-gmbh", { channel: "telegram", chatId: "12345" }, "/crm");

    const config = JSON.parse(
      vol.readFileSync("/crm/.agentic/agents/beta-gmbh.agent.json", "utf-8") as string
    ) as Record<string, unknown>;
    expect(config["telegramChatId"]).toBe("12345");

    consoleSpy.mockRestore();
  });
});

describe("runAgentStatus", () => {
  it("shows message when no agents configured", async () => {
    vol.fromJSON({});

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAgentStatus } = await import("../../src/commands/agent.js");

    await runAgentStatus("/crm");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No agents"));
    consoleSpy.mockRestore();
  });

  it("lists configured agents", async () => {
    vol.fromJSON({
      "/crm/.agentic/agents/acme-corp.agent.json": JSON.stringify({
        slug: "acme-corp",
        channel: "telegram",
        wakeOn: ["email"],
        createdAt: new Date().toISOString(),
        lastWake: null,
      }),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAgentStatus } = await import("../../src/commands/agent.js");

    await runAgentStatus("/crm");

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(output).toContain("acme-corp");
    consoleSpy.mockRestore();
  });
});

describe("runAgentRemove", () => {
  it("removes agent config file", async () => {
    vol.fromJSON({
      "/crm/.agentic/agents/acme-corp.agent.json": "{}",
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAgentRemove } = await import("../../src/commands/agent.js");

    await runAgentRemove("acme-corp", "/crm");

    expect(vol.existsSync("/crm/.agentic/agents/acme-corp.agent.json")).toBe(false);
    consoleSpy.mockRestore();
  });
});
