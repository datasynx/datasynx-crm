import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// Drive the raw `https.request` legacy path without a real socket: the mock
// returns a fake request whose `.end()` synchronously emits either a transport
// error or a response stream from a per-call queue.
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock("https", () => ({ default: { request: requestMock }, request: requestMock }));

import { listEventTypes, getSchedulingLink } from "../../src/sync/calendly.js";

type Resp = { body?: string; error?: Error };
let queue: Resp[] = [];

function enqueue(...rs: Resp[]): void {
  queue.push(...rs);
}

function userMeBody(uri: string): string {
  return JSON.stringify({ resource: { uri } });
}

function eventTypesBody(ets: Array<{ slug: string; name: string; url?: string }>): string {
  return JSON.stringify({
    collection: ets.map((et, i) => ({
      uri: `https://api.calendly.com/event_types/et-${i}`,
      slug: et.slug,
      name: et.name,
      duration: 30,
      scheduling_url: et.url ?? `https://calendly.com/acme/${et.slug}`,
      active: true,
    })),
  });
}

beforeEach(() => {
  queue = [];
  vi.clearAllMocks();
  requestMock.mockImplementation(
    (_url: unknown, _opts: unknown, cb: (res: EventEmitter) => void) => {
      const item = queue.shift();
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = (): void => {
        if (!item) return;
        if (item.error) {
          req.emit("error", item.error);
          return;
        }
        const res = new EventEmitter();
        cb(res);
        if (item.body !== undefined) res.emit("data", Buffer.from(item.body));
        res.emit("end");
      };
      return req;
    }
  );
});

describe("listEventTypes", () => {
  it("resolves the user URI, then maps Calendly's snake_case shape", async () => {
    enqueue(
      { body: userMeBody("https://api.calendly.com/users/u1") },
      { body: eventTypesBody([{ slug: "intro", name: "Intro Call" }]) }
    );

    const result = await listEventTypes("key-123");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: "intro",
      name: "Intro Call",
      duration: 30,
      schedulingUrl: "https://calendly.com/acme/intro",
      active: true,
    });

    // First request hits /users/me with a Bearer header.
    const firstCall = requestMock.mock.calls[0]!;
    expect(firstCall[0]).toBe("https://api.calendly.com/users/me");
    expect((firstCall[1] as { headers: Record<string, string> }).headers.Authorization).toBe(
      "Bearer key-123"
    );
    // Second request URL-encodes the user URI into the query.
    expect(requestMock.mock.calls[1]![0]).toBe(
      "https://api.calendly.com/event_types?user=https%3A%2F%2Fapi.calendly.com%2Fusers%2Fu1&active=true"
    );
  });

  it("rejects with a descriptive error when the API returns invalid JSON", async () => {
    enqueue({ body: "<html>oops</html>" });
    await expect(listEventTypes("key")).rejects.toThrow("Invalid JSON from Calendly API");
  });

  it("rejects when the transport errors", async () => {
    enqueue({ error: new Error("ECONNREFUSED") });
    await expect(listEventTypes("key")).rejects.toThrow("ECONNREFUSED");
  });
});

describe("getSchedulingLink", () => {
  it("matches an event type by exact slug and returns its scheduling URL", async () => {
    enqueue(
      { body: userMeBody("https://api.calendly.com/users/u1") },
      { body: eventTypesBody([{ slug: "intro", name: "Intro Call" }]) }
    );

    const url = await getSchedulingLink("key", "intro");
    expect(url).toBe("https://calendly.com/acme/intro");
  });

  it("falls back to a case-insensitive name-substring match", async () => {
    enqueue(
      { body: userMeBody("https://api.calendly.com/users/u1") },
      { body: eventTypesBody([{ slug: "30min", name: "Discovery Session" }]) }
    );

    const url = await getSchedulingLink("key", "discovery");
    expect(url).toBe("https://calendly.com/acme/30min");
  });

  it("throws when no event type matches", async () => {
    enqueue(
      { body: userMeBody("https://api.calendly.com/users/u1") },
      { body: eventTypesBody([{ slug: "intro", name: "Intro Call" }]) }
    );

    await expect(getSchedulingLink("key", "nonexistent")).rejects.toThrow(
      "Event type 'nonexistent' not found in Calendly"
    );
  });

  it("appends name and email prefill query params", async () => {
    enqueue(
      { body: userMeBody("https://api.calendly.com/users/u1") },
      { body: eventTypesBody([{ slug: "intro", name: "Intro Call" }]) }
    );

    const url = await getSchedulingLink("key", "intro", {
      name: "John Doe",
      email: "john@acme.com",
    });

    expect(url).toContain("https://calendly.com/acme/intro?");
    expect(url).toContain("name=John+Doe");
    expect(url).toContain("email=john%40acme.com");
  });

  it("returns the bare scheduling URL when prefill is empty", async () => {
    enqueue(
      { body: userMeBody("https://api.calendly.com/users/u1") },
      { body: eventTypesBody([{ slug: "intro", name: "Intro Call" }]) }
    );

    const url = await getSchedulingLink("key", "intro", {});
    expect(url).toBe("https://calendly.com/acme/intro");
  });
});
