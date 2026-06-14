import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
});

describe("emitUnmatchedConversationsDigest (#75)", () => {
  it("is a no-op when the queue is empty", async () => {
    const { emitUnmatchedConversationsDigest } =
      await import("../../src/core/unmatched-conversations-digest.js");
    const result = await emitUnmatchedConversationsDigest(DATA_DIR);
    expect(result).toBeNull();
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("emits queue.unmatched_conversations_digest with count, oldest and refs", async () => {
    const { appendUnmatchedConversation } = await import("../../src/fs/unmatched-conversations.js");
    appendUnmatchedConversation(DATA_DIR, {
      id: "conv_a",
      channel: "web",
      threadKey: "s-a",
      contact: { email: "a@x.com" },
      addedAt: "2026-06-01T08:00:00Z",
      reason: "no_customer_match",
    });
    appendUnmatchedConversation(DATA_DIR, {
      id: "conv_b",
      channel: "whatsapp",
      threadKey: "+15550001111",
      contact: { phone: "+15550001111" },
      addedAt: "2026-06-05T08:00:00Z",
      reason: "no_contact_identifier",
    });

    const { emitUnmatchedConversationsDigest } =
      await import("../../src/core/unmatched-conversations-digest.js");
    const result = await emitUnmatchedConversationsDigest(DATA_DIR);
    expect(result).toEqual({ count: 2, oldest: "2026-06-01T08:00:00Z" });
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "queue.unmatched_conversations_digest",
      expect.objectContaining({
        count: 2,
        oldest: "2026-06-01T08:00:00Z",
        refs: ["conv_a", "conv_b"],
      })
    );
  });
});
