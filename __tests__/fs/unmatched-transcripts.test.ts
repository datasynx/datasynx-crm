import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  appendUnmatched,
  readUnmatched,
  clearUnmatched,
} from "../../src/fs/unmatched-transcripts.js";

const DATA_DIR = "/data";
const UNMATCHED_PATH = `${DATA_DIR}/.agentic/unmatched-transcripts.json`;

beforeEach(() => {
  vol.reset();
});

describe("readUnmatched", () => {
  it("returns empty array when file does not exist", () => {
    const result = readUnmatched(DATA_DIR);
    expect(result).toEqual([]);
  });

  it("returns parsed array when file exists", () => {
    const entries = [
      {
        filePath: "/transcripts/foo.vtt",
        addedAt: "2026-01-01T00:00:00.000Z",
        reason: "no_customer_match" as const,
      },
    ];
    vol.fromJSON({ [UNMATCHED_PATH]: JSON.stringify(entries) });
    const result = readUnmatched(DATA_DIR);
    expect(result).toEqual(entries);
  });

  it("returns empty array when file is invalid JSON", () => {
    vol.fromJSON({ [UNMATCHED_PATH]: "not-json" });
    const result = readUnmatched(DATA_DIR);
    expect(result).toEqual([]);
  });
});

describe("appendUnmatched", () => {
  it("creates the file if it does not exist and appends entry", () => {
    const entry = {
      filePath: "/transcripts/foo.vtt",
      addedAt: "2026-01-01T00:00:00.000Z",
      reason: "no_customer_match" as const,
    };
    appendUnmatched(DATA_DIR, entry);
    const result = readUnmatched(DATA_DIR);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(entry);
  });

  it("appends to existing entries without overwriting", () => {
    const first = {
      filePath: "/transcripts/a.vtt",
      addedAt: "2026-01-01T00:00:00.000Z",
      reason: "no_customer_match" as const,
    };
    const second = {
      filePath: "/transcripts/b.vtt",
      addedAt: "2026-01-02T00:00:00.000Z",
      reason: "no_customers_defined" as const,
    };
    appendUnmatched(DATA_DIR, first);
    appendUnmatched(DATA_DIR, second);
    const result = readUnmatched(DATA_DIR);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(first);
    expect(result[1]).toEqual(second);
  });

  it("creates .agentic directory if it does not exist", () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/`]: null });
    const entry = {
      filePath: "/transcripts/c.vtt",
      addedAt: "2026-01-01T00:00:00.000Z",
      reason: "no_customers_defined" as const,
    };
    appendUnmatched(DATA_DIR, entry);
    const result = readUnmatched(DATA_DIR);
    expect(result).toHaveLength(1);
  });
});

describe("clearUnmatched", () => {
  it("resets the file to an empty array", () => {
    const entry = {
      filePath: "/transcripts/foo.vtt",
      addedAt: "2026-01-01T00:00:00.000Z",
      reason: "no_customer_match" as const,
    };
    appendUnmatched(DATA_DIR, entry);
    clearUnmatched(DATA_DIR);
    const result = readUnmatched(DATA_DIR);
    expect(result).toEqual([]);
  });

  it("does not throw when file does not exist", () => {
    expect(() => clearUnmatched(DATA_DIR)).not.toThrow();
  });
});
