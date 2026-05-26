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

describe("runStatus — daemon state", () => {
  it("shows 'not running' when no PID file exists", async () => {
    vol.fromJSON({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/not running/i);
    logSpy.mockRestore();
  });

  it("shows PID when daemon is running", async () => {
    vol.fromJSON({ "/data/.agentic/daemon.pid": "99999" });
    // Mock process.kill to not throw (simulating process exists)
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/99999/);
    killSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("runStatus — customer counts", () => {
  it("shows customer count from customers/ directory", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/data/customers/beta-gmbh/main_facts.md": "---\nname: Beta\n---\n",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/2/);
    logSpy.mockRestore();
  });

  it("shows 0 customers when customers/ does not exist", async () => {
    vol.fromJSON({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/0/);
    logSpy.mockRestore();
  });
});

describe("runStatus — sync state", () => {
  it("shows sync age from sync-state.json", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/data/.agentic/sync-state.json": JSON.stringify({
        "acme-corp": { lastGmailSync: twoHoursAgo },
      }),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/acme-corp/);
    expect(output).toMatch(/vor 2 Std/);
    logSpy.mockRestore();
  });

  it("shows 'noch kein Sync' when customer has no sync entry", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/data/.agentic/sync-state.json": JSON.stringify({}),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/noch kein Sync/i);
    logSpy.mockRestore();
  });
});

describe("runStatus — unmatched", () => {
  it("shows unmatched transcript count", async () => {
    vol.fromJSON({
      "/data/.agentic/unmatched-transcripts.json": JSON.stringify([
        { filePath: "/t/a.vtt", addedAt: "2026-01-01T00:00:00.000Z", reason: "no_customer_match" },
        { filePath: "/t/b.vtt", addedAt: "2026-01-01T00:00:00.000Z", reason: "no_customer_match" },
      ]),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/2 Transcript/);
    logSpy.mockRestore();
  });

  it("--unmatched flag lists transcript paths", async () => {
    vol.fromJSON({
      "/data/.agentic/unmatched-transcripts.json": JSON.stringify([
        { filePath: "/transcripts/meeting.vtt", addedAt: "2026-01-01T00:00:00.000Z", reason: "no_customer_match" },
      ]),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({ unmatched: true }, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/meeting\.vtt/);
    logSpy.mockRestore();
  });

  it("--unmatched shows empty message when queue is empty", async () => {
    vol.fromJSON({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({ unmatched: true }, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/keine|leer|empty|0/i);
    logSpy.mockRestore();
  });
});
