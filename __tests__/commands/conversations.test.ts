import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync("/data/.agentic", { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue("/data");
  process.exitCode = 0;
});

async function seedUnmatched(): Promise<string> {
  const { createCustomer } = await import("../../src/commands/create.js");
  await createCustomer({ name: "Acme", domain: "acme.com", dataDir: "/data" });
  const { ingestInbound } = await import("../../src/core/conversations.js");
  const conv = await ingestInbound("/data", {
    channel: "web",
    threadKey: "sess-1",
    contact: { email: "stranger@nowhere.com" },
    text: "I need help",
  });
  return conv.id;
}

describe("conversations unmatched listing (#75)", () => {
  it("prints the friendly empty line when the queue is empty", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { conversationsCommand } = await import("../../src/commands/conversations.js");
    await conversationsCommand.parseAsync(["unmatched"], { from: "user" });
    expect(logSpy.mock.calls.flat().join(" ")).toContain("No unmatched conversations");
    logSpy.mockRestore();
  });

  it("lists queued unmatched conversations", async () => {
    const id = await seedUnmatched();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { conversationsCommand } = await import("../../src/commands/conversations.js");
    await conversationsCommand.parseAsync(["unmatched"], { from: "user" });
    const out = logSpy.mock.calls.flat().join(" ");
    expect(out).toContain(id);
    expect(out).toContain("no_customer_match");
    logSpy.mockRestore();
  });
});

describe("runConversationsResolve (#75)", () => {
  it("links the conversation, drains the queue, and reports success", async () => {
    const id = await seedUnmatched();
    const { readUnmatchedConversations } = await import("../../src/fs/unmatched-conversations.js");
    expect(readUnmatchedConversations("/data")).toHaveLength(1);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { runConversationsResolve } = await import("../../src/commands/conversations.js");
    await runConversationsResolve(id, "acme");

    expect(process.exitCode).toBe(0);
    expect(logSpy.mock.calls.flat().join(" ")).toContain("linked to acme");
    expect(readUnmatchedConversations("/data")).toHaveLength(0);

    const { getConversation } = await import("../../src/core/conversations.js");
    expect(getConversation("/data", id)?.slug).toBe("acme");
    logSpy.mockRestore();
  });

  it("fails with exit code 1 for an unknown conversation ref", async () => {
    await seedUnmatched();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runConversationsResolve } = await import("../../src/commands/conversations.js");
    await runConversationsResolve("conv_doesnotexist", "acme");
    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join(" ")).toContain("No conversation");
    errSpy.mockRestore();
  });

  it("fails with exit code 1 for an unknown customer slug", async () => {
    const id = await seedUnmatched();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runConversationsResolve } = await import("../../src/commands/conversations.js");
    await runConversationsResolve(id, "ghost-co");
    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join(" ")).toContain("Unknown customer slug");
    errSpy.mockRestore();
  });
});

describe("conversations clear (#75)", () => {
  it("empties the queue", async () => {
    await seedUnmatched();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { conversationsCommand } = await import("../../src/commands/conversations.js");
    await conversationsCommand.parseAsync(["clear"], { from: "user" });
    const { readUnmatchedConversations } = await import("../../src/fs/unmatched-conversations.js");
    expect(readUnmatchedConversations("/data")).toHaveLength(0);
    logSpy.mockRestore();
  });
});
