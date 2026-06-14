import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  appendUnmatchedConversation,
  readUnmatchedConversations,
  removeUnmatchedConversation,
  clearUnmatchedConversations,
  type UnmatchedConversation,
} from "../../src/fs/unmatched-conversations.js";

const DATA_DIR = "/data";
const QUEUE_PATH = `${DATA_DIR}/.agentic/unmatched-conversations.json`;

function entry(over: Partial<UnmatchedConversation> = {}): UnmatchedConversation {
  return {
    id: "conv_abc123",
    channel: "web",
    threadKey: "session-1",
    contact: { email: "stranger@unknown.com" },
    addedAt: "2026-06-01T08:00:00.000Z",
    reason: "no_customer_match",
    ...over,
  };
}

beforeEach(() => {
  vol.reset();
});

describe("readUnmatchedConversations", () => {
  it("returns empty array when file does not exist", () => {
    expect(readUnmatchedConversations(DATA_DIR)).toEqual([]);
  });

  it("returns the parsed array when the file exists", () => {
    const entries = [entry()];
    vol.fromJSON({ [QUEUE_PATH]: JSON.stringify(entries) });
    expect(readUnmatchedConversations(DATA_DIR)).toEqual(entries);
  });

  it("returns empty array on invalid JSON", () => {
    vol.fromJSON({ [QUEUE_PATH]: "not-json" });
    expect(readUnmatchedConversations(DATA_DIR)).toEqual([]);
  });
});

describe("appendUnmatchedConversation", () => {
  it("creates the file and appends, returning true", () => {
    const added = appendUnmatchedConversation(DATA_DIR, entry());
    expect(added).toBe(true);
    expect(readUnmatchedConversations(DATA_DIR)).toHaveLength(1);
  });

  it("preserves order across appends", () => {
    appendUnmatchedConversation(DATA_DIR, entry({ id: "conv_a" }));
    appendUnmatchedConversation(DATA_DIR, entry({ id: "conv_b", reason: "no_contact_identifier" }));
    const q = readUnmatchedConversations(DATA_DIR);
    expect(q.map((c) => c.id)).toEqual(["conv_a", "conv_b"]);
  });

  it("is idempotent by id: a second append of the same id returns false and does not duplicate", () => {
    expect(appendUnmatchedConversation(DATA_DIR, entry({ id: "conv_a" }))).toBe(true);
    expect(appendUnmatchedConversation(DATA_DIR, entry({ id: "conv_a" }))).toBe(false);
    expect(readUnmatchedConversations(DATA_DIR)).toHaveLength(1);
  });
});

describe("removeUnmatchedConversation", () => {
  it("removes one entry by id and returns true", () => {
    appendUnmatchedConversation(DATA_DIR, entry({ id: "conv_a" }));
    appendUnmatchedConversation(DATA_DIR, entry({ id: "conv_b" }));
    expect(removeUnmatchedConversation(DATA_DIR, "conv_a")).toBe(true);
    expect(readUnmatchedConversations(DATA_DIR).map((c) => c.id)).toEqual(["conv_b"]);
  });

  it("returns false when the id is not queued", () => {
    appendUnmatchedConversation(DATA_DIR, entry({ id: "conv_a" }));
    expect(removeUnmatchedConversation(DATA_DIR, "conv_missing")).toBe(false);
    expect(readUnmatchedConversations(DATA_DIR)).toHaveLength(1);
  });
});

describe("clearUnmatchedConversations", () => {
  it("resets the queue to empty", () => {
    appendUnmatchedConversation(DATA_DIR, entry());
    clearUnmatchedConversations(DATA_DIR);
    expect(readUnmatchedConversations(DATA_DIR)).toEqual([]);
  });

  it("does not throw when the file does not exist", () => {
    expect(() => clearUnmatchedConversations(DATA_DIR)).not.toThrow();
  });
});
