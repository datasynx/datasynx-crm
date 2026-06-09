import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  recordSentMail,
  readSentMail,
  findSentByThread,
  appendEmailEvent,
  readEmailEvents,
  correlateReply,
  aggregateEngagement,
} from "../../src/fs/sent-store.js";

const DATA_DIR = "/data";

beforeEach(() => vol.reset());

describe("sent-store", () => {
  it("records a sent mail + a sent event", () => {
    recordSentMail(DATA_DIR, {
      messageId: "m1",
      threadId: "t1",
      slug: "acme",
      contactEmail: "a@acme.com",
      sentAt: "2026-06-09T10:00:00.000Z",
    });
    expect(readSentMail(DATA_DIR)).toHaveLength(1);
    const events = readEmailEvents(DATA_DIR);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("sent");
  });

  it("findSentByThread returns the most recent un-replied record", () => {
    recordSentMail(DATA_DIR, {
      messageId: "m1",
      threadId: "t1",
      slug: "acme",
      contactEmail: "a@acme.com",
      sentAt: "2026-06-01T10:00:00.000Z",
    });
    recordSentMail(DATA_DIR, {
      messageId: "m2",
      threadId: "t1",
      slug: "acme",
      contactEmail: "a@acme.com",
      sentAt: "2026-06-05T10:00:00.000Z",
    });
    expect(findSentByThread(DATA_DIR, "t1")?.messageId).toBe("m2");
  });
});

describe("correlateReply", () => {
  it("detects a reply by thread id and records latency (no pixel)", () => {
    recordSentMail(DATA_DIR, {
      messageId: "m1",
      threadId: "t1",
      slug: "acme",
      contactEmail: "a@acme.com",
      sentAt: "2026-06-09T10:00:00.000Z",
    });
    const reply = correlateReply(DATA_DIR, {
      threadId: "t1",
      from: "a@acme.com",
      at: "2026-06-09T14:00:00.000Z",
    });
    expect(reply).not.toBeNull();
    expect(reply!.type).toBe("reply");
    expect(reply!.latencyHours).toBe(4);
    // sent record is stamped so a second inbound on the thread does not double count
    const again = correlateReply(DATA_DIR, {
      threadId: "t1",
      from: "a@acme.com",
      at: "2026-06-09T20:00:00.000Z",
    });
    expect(again).toBeNull();
    expect(readEmailEvents(DATA_DIR).filter((e) => e.type === "reply")).toHaveLength(1);
  });

  it("returns null when no sent mail matches the thread", () => {
    expect(
      correlateReply(DATA_DIR, { threadId: "ghost", at: "2026-06-09T14:00:00.000Z" })
    ).toBeNull();
  });
});

describe("aggregateEngagement", () => {
  it("summarizes opens, clicks, replies per contact", () => {
    const base = { slug: "acme", contactEmail: "a@acme.com" };
    appendEmailEvent(DATA_DIR, { ...base, type: "sent", at: "2026-06-09T10:00:00.000Z" });
    appendEmailEvent(DATA_DIR, { ...base, type: "open", at: "2026-06-09T11:00:00.000Z" });
    appendEmailEvent(DATA_DIR, { ...base, type: "open", at: "2026-06-09T12:00:00.000Z" });
    appendEmailEvent(DATA_DIR, {
      ...base,
      type: "click",
      at: "2026-06-09T12:30:00.000Z",
      url: "https://acme.com",
    });
    appendEmailEvent(DATA_DIR, {
      ...base,
      type: "reply",
      at: "2026-06-09T14:00:00.000Z",
      latencyHours: 4,
    });
    // other customer ignored
    appendEmailEvent(DATA_DIR, {
      slug: "beta",
      contactEmail: "x@beta.com",
      type: "open",
      at: "2026-06-09T10:00:00.000Z",
    });

    const agg = aggregateEngagement(DATA_DIR, "acme");
    expect(agg).toHaveLength(1);
    expect(agg[0]).toMatchObject({
      contactEmail: "a@acme.com",
      sent: 1,
      opens: 2,
      clicks: 1,
      replies: 1,
      lastOpenAt: "2026-06-09T12:00:00.000Z",
      avgReplyLatencyHours: 4,
    });
  });
});
