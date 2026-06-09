import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

const DATA_DIR = "/data";

function parse(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

beforeEach(() => vol.reset());

describe("get_email_engagement tool", () => {
  it("returns empty totals when there are no events", async () => {
    const { handleGetEmailEngagement } =
      await import("../../../src/mcp/tools/get-email-engagement.js");
    const res = parse(await handleGetEmailEngagement({ slug: "acme" }, DATA_DIR));
    expect(res["totals"]).toEqual({ sent: 0, opens: 0, clicks: 0, replies: 0 });
    expect(res["contacts"]).toEqual([]);
  });

  it("aggregates opens/clicks/replies per contact", async () => {
    const { appendEmailEvent } = await import("../../../src/fs/sent-store.js");
    const base = { slug: "acme", contactEmail: "a@acme.com" };
    appendEmailEvent(DATA_DIR, { ...base, type: "sent", at: "2026-06-09T10:00:00Z" });
    appendEmailEvent(DATA_DIR, { ...base, type: "open", at: "2026-06-09T11:00:00Z" });
    appendEmailEvent(DATA_DIR, {
      ...base,
      type: "reply",
      at: "2026-06-09T14:00:00Z",
      latencyHours: 4,
    });

    const { handleGetEmailEngagement } =
      await import("../../../src/mcp/tools/get-email-engagement.js");
    const res = parse(await handleGetEmailEngagement({ slug: "acme" }, DATA_DIR));
    expect(res["totals"]).toEqual({ sent: 1, opens: 1, clicks: 0, replies: 1 });
    const contacts = res["contacts"] as Array<{
      contactEmail: string;
      avgReplyLatencyHours: number;
    }>;
    expect(contacts[0]!.contactEmail).toBe("a@acme.com");
    expect(contacts[0]!.avgReplyLatencyHours).toBe(4);
  });
});
