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

describe("emitUnmatchedDigest (#66)", () => {
  it("is a no-op when the queue is empty", async () => {
    const { emitUnmatchedDigest } = await import("../../src/core/unmatched-digest.js");
    const result = await emitUnmatchedDigest(DATA_DIR);
    expect(result).toBeNull();
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("emits queue.unmatched_digest with count and oldest entry", async () => {
    const { appendUnmatched } = await import("../../src/fs/unmatched-transcripts.js");
    appendUnmatched(DATA_DIR, {
      filePath: "teams://onlineMeetings/m-1",
      addedAt: "2026-06-01T08:00:00Z",
      reason: "no_customer_match",
    });
    appendUnmatched(DATA_DIR, {
      filePath: "meet://conferenceRecords/cr-2",
      addedAt: "2026-06-05T08:00:00Z",
      reason: "no_customer_match",
    });

    const { emitUnmatchedDigest } = await import("../../src/core/unmatched-digest.js");
    const result = await emitUnmatchedDigest(DATA_DIR);
    expect(result).toEqual({ count: 2, oldest: "2026-06-01T08:00:00Z" });
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "queue.unmatched_digest",
      expect.objectContaining({
        count: 2,
        oldest: "2026-06-01T08:00:00Z",
        refs: ["teams://onlineMeetings/m-1", "meet://conferenceRecords/cr-2"],
      })
    );
  });
});
