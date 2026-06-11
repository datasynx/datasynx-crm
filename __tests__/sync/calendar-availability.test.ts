import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import { getBusyIntervals, createCalendarEvent } from "../../src/sync/calendar-availability.js";
import type { Interval } from "../../src/core/booking.js";

const RANGE: Interval = { start: 1_000, end: 10_000 };

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  vol.fromJSON({ "/data/.agentic/.keep": "" });
});

describe("getBusyIntervals", () => {
  it("merges injected calendar busy with locally-recorded bookings", async () => {
    vol.fromJSON({
      "/data/.agentic/bookings.ndjson": [
        JSON.stringify({ rep: "alice", start: 2_000, end: 3_000 }),
        JSON.stringify({ rep: "bob", start: 2_000, end: 3_000 }), // other rep → ignored
        JSON.stringify({ rep: "alice", start: 50_000, end: 60_000 }), // outside range → ignored
        JSON.stringify({ rep: "alice" }), // missing start/end → ignored
      ].join("\n"),
    });

    const busyForRep = vi.fn().mockResolvedValue([{ start: 4_000, end: 5_000 }]);
    const out = await getBusyIntervals("/data", ["alice"], RANGE, { busyForRep });

    expect(busyForRep).toHaveBeenCalledWith("/data", "alice", RANGE);
    expect(out["alice"]).toEqual([
      { start: 4_000, end: 5_000 }, // from the calendar lookup
      { start: 2_000, end: 3_000 }, // the single in-range local booking
    ]);
  });

  it("treats a rep as fully free when the calendar lookup fails", async () => {
    const busyForRep = vi.fn().mockRejectedValue(new Error("graph 401"));
    const out = await getBusyIntervals("/data", ["alice"], RANGE, { busyForRep });
    expect(out["alice"]).toEqual([]);
  });

  it("returns no busy intervals with the offline default (no calendar, no bookings)", async () => {
    const out = await getBusyIntervals("/data", ["alice"], RANGE);
    expect(out["alice"]).toEqual([]);
  });

  it("returns [] for a rep when the bookings file is malformed", async () => {
    vol.fromJSON({
      "/data/.agentic/bookings.ndjson": "this is not json\n" + JSON.stringify({ rep: "alice" }),
    });
    const out = await getBusyIntervals("/data", ["alice"], RANGE);
    expect(out["alice"]).toEqual([]);
  });
});

describe("createCalendarEvent", () => {
  const ev = {
    start: 2_000,
    end: 3_000,
    title: "Intro",
    name: "John",
    email: "john@acme.com",
  };

  it("returns null in the offline default (no provider connected)", async () => {
    const id = await createCalendarEvent("/data", "alice", ev);
    expect(id).toBeNull();
  });

  it("delegates to an injected provider and returns its event id", async () => {
    const insertEvent = vi.fn().mockResolvedValue("evt-123");
    const id = await createCalendarEvent("/data", "alice", ev, { insertEvent });
    expect(id).toBe("evt-123");
    expect(insertEvent).toHaveBeenCalledWith("alice", ev);
  });

  it("never throws — a provider failure returns null and the booking still stands", async () => {
    const insertEvent = vi.fn().mockRejectedValue(new Error("graph 500"));
    const id = await createCalendarEvent("/data", "alice", ev, { insertEvent });
    expect(id).toBeNull();
  });
});
