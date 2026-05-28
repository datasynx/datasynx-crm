import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("runPushRegister", () => {
  it("prints success message and subscriptionId after registration", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushRegister } = await import("../../src/commands/push.js");
    await runPushRegister("acme-corp", {
      provider: "gmail",
      webhookUrl: "https://example.com/webhooks/gmail",
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("psub_"));
    consoleSpy.mockRestore();
  });

  it("warns when webhookUrl contains localhost", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushRegister } = await import("../../src/commands/push.js");
    await runPushRegister("acme-corp", {
      provider: "slack",
      webhookUrl: "http://localhost:3847/webhooks/slack",
    });

    const allOutput = consoleSpy.mock.calls.flat().join(" ");
    expect(allOutput.toLowerCase()).toContain("localhost");
    consoleSpy.mockRestore();
  });
});

describe("runPushStatus", () => {
  it("prints 'no subscriptions' when empty", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushStatus } = await import("../../src/commands/push.js");
    await runPushStatus({});

    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("No push subscriptions");
    consoleSpy.mockRestore();
  });

  it("lists active subscriptions", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [{
          id: "psub_1_abc",
          provider: "gmail",
          slug: "acme-corp",
          webhookUrl: "https://example.com/webhooks/gmail",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          renewedAt: null,
          createdAt: new Date().toISOString(),
          providerData: {},
          status: "active",
          lastEventAt: null,
          eventsProcessed: 42,
        }],
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushStatus } = await import("../../src/commands/push.js");
    await runPushStatus({});

    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("acme-corp");
    expect(output).toContain("gmail");
    consoleSpy.mockRestore();
  });
});

describe("runPushRevoke", () => {
  it("prints error when subscription id not found", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    const { runPushRevoke } = await import("../../src/commands/push.js");
    await expect(runPushRevoke("psub_nonexistent")).rejects.toThrow("exit");

    expect(consoleErrSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    consoleErrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("marks subscription as revoked", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [{
          id: "psub_revoke_me",
          provider: "gmail",
          slug: "acme-corp",
          webhookUrl: "https://example.com",
          expiresAt: null,
          renewedAt: null,
          createdAt: new Date().toISOString(),
          providerData: {},
          status: "active",
          lastEventAt: null,
          eventsProcessed: 0,
        }],
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushRevoke } = await import("../../src/commands/push.js");
    await runPushRevoke("psub_revoke_me");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("revoked"));
    consoleSpy.mockRestore();
  });
});
