import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExternalSignal } from "../../src/sync/external-signals.js";

// ─── https mock ───────────────────────────────────────────────────────────────

const mockHttpsRequest = vi.hoisted(() => vi.fn());
vi.mock("https", () => ({ default: { request: mockHttpsRequest } }));

// ─── memfs ────────────────────────────────────────────────────────────────────

import { vol } from "memfs";
vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DATA_DIR = "/data";
const TODAY = "2026-05-28";

type HttpCallback = (res: {
  on: (event: string, cb: (chunk?: Buffer | string) => void) => void;
}) => void;

/** Wire mockHttpsRequest to respond with `body` JSON, return req handle. */
function mockHttpResponse(body: unknown) {
  let errorCb: ((e: Error) => void) | undefined;
  const req = {
    on: vi.fn((event: string, cb: (e: Error) => void) => {
      if (event === "error") errorCb = cb;
    }),
    setTimeout: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    _triggerError: (e: Error) => errorCb?.(e),
  };

  mockHttpsRequest.mockImplementationOnce((_opts: unknown, cb: HttpCallback) => {
    const res = {
      on: (event: string, handler: (chunk?: Buffer | string) => void) => {
        if (event === "data") handler(JSON.stringify(body));
        if (event === "end") handler();
      },
    };
    cb(res);
    return req;
  });
  return req;
}

function mockHttpError(err: Error) {
  let errorCb: ((e: Error) => void) | undefined;
  const req = {
    on: vi.fn((event: string, cb: (e: Error) => void) => {
      if (event === "error") errorCb = cb;
    }),
    setTimeout: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    _trigger: () => errorCb?.(err),
  };
  mockHttpsRequest.mockImplementationOnce((_opts: unknown, _cb: HttpCallback) => req);
  return req;
}

// ─── readSignals / writeSignals ───────────────────────────────────────────────

describe("readSignals / writeSignals", () => {
  beforeEach(() => {
    vol.reset();
  });

  it("returns [] when signals file does not exist", async () => {
    vol.fromJSON({});
    const { readSignals } = await import("../../src/sync/external-signals.js");
    expect(readSignals(DATA_DIR, "acme", TODAY)).toEqual([]);
  });

  it("writes and reads back signals", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { writeSignals, readSignals } = await import("../../src/sync/external-signals.js");

    const signals: ExternalSignal[] = [
      {
        id: "hn_1",
        slug: "acme",
        source: "hacker_news",
        type: "funding_round",
        summary: "Acme raises $10M",
        detectedAt: new Date().toISOString(),
        impact: "positive",
      },
    ];

    writeSignals(DATA_DIR, "acme", TODAY, signals);
    const read = readSignals(DATA_DIR, "acme", TODAY);
    expect(read).toHaveLength(1);
    expect(read[0]!.id).toBe("hn_1");
  });

  it("creates signals/ subdirectory if missing", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { writeSignals } = await import("../../src/sync/external-signals.js");
    writeSignals(DATA_DIR, "acme", TODAY, []);
    const fs = (await import("fs")).default;
    expect(fs.existsSync(`${DATA_DIR}/customers/acme/signals`)).toBe(true);
  });
});

// ─── checkCompanyNews ─────────────────────────────────────────────────────────

describe("checkCompanyNews", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns signals from HN results matching query", async () => {
    mockHttpResponse({
      hits: [
        { objectID: "42", title: "Acme funding round $50M announced", created_at: "2026-05-01" },
        { objectID: "43", title: "Unrelated story about cats", created_at: "2026-05-02" },
      ],
    });

    const { checkCompanyNews } = await import("../../src/sync/external-signals.js");
    const signals = await checkCompanyNews("acme.com", "Acme Corp");

    expect(signals).toHaveLength(1);
    expect(signals[0]!.type).toBe("funding_round");
    expect(signals[0]!.impact).toBe("positive");
    expect(signals[0]!.source).toBe("hacker_news");
    expect(signals[0]!.summary).toContain("Acme");
  });

  it("classifies layoffs as negative", async () => {
    mockHttpResponse({
      hits: [{ objectID: "99", title: "Acme lays off 200 employees", created_at: "2026-05-01" }],
    });

    const { checkCompanyNews } = await import("../../src/sync/external-signals.js");
    const signals = await checkCompanyNews("acme.com", "Acme");

    expect(signals[0]!.type).toBe("layoffs");
    expect(signals[0]!.impact).toBe("negative");
  });

  it("classifies acquisition as positive", async () => {
    mockHttpResponse({
      hits: [{ objectID: "77", title: "Acme acquires RivalCo", created_at: "2026-05-01" }],
    });

    const { checkCompanyNews } = await import("../../src/sync/external-signals.js");
    const signals = await checkCompanyNews("acme.com", "Acme");

    expect(signals[0]!.type).toBe("acquisition");
    expect(signals[0]!.impact).toBe("positive");
  });

  it("classifies generic news as neutral", async () => {
    mockHttpResponse({
      hits: [{ objectID: "55", title: "Acme announces new product", created_at: "2026-05-01" }],
    });

    const { checkCompanyNews } = await import("../../src/sync/external-signals.js");
    const signals = await checkCompanyNews("acme.com", "Acme");

    expect(signals[0]!.type).toBe("news_mention");
    expect(signals[0]!.impact).toBe("neutral");
  });

  it("returns [] and does not throw on network error", async () => {
    const req = mockHttpError(new Error("ECONNREFUSED"));

    const { checkCompanyNews } = await import("../../src/sync/external-signals.js");
    const signalsPromise = checkCompanyNews("acme.com", "Acme");
    req._trigger();
    const signals = await signalsPromise;

    expect(signals).toEqual([]);
  });

  it("falls back to story_title when title is undefined", async () => {
    mockHttpResponse({
      hits: [{ objectID: "88", story_title: "Acme raises Series A", created_at: "2026-05-01" }],
    });

    const { checkCompanyNews } = await import("../../src/sync/external-signals.js");
    const signals = await checkCompanyNews("acme.com", "Acme");

    expect(signals[0]!.summary).toContain("Acme");
  });
});

// ─── checkFundingEvents ───────────────────────────────────────────────────────

describe("checkFundingEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env["CRUNCHBASE_API_KEY"];
  });

  it("returns [] when no CRUNCHBASE_API_KEY", async () => {
    const { checkFundingEvents } = await import("../../src/sync/external-signals.js");
    const result = await checkFundingEvents("acme.com");
    expect(result).toEqual([]);
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("returns funding signal when API returns data", async () => {
    process.env["CRUNCHBASE_API_KEY"] = "cb_key_123";
    mockHttpResponse({
      data: {
        properties: {
          last_funding_type: "series_b",
          funding_total: { value_usd: 25_000_000 },
        },
      },
    });

    const { checkFundingEvents } = await import("../../src/sync/external-signals.js");
    const signals = await checkFundingEvents("acme.com");

    expect(signals).toHaveLength(1);
    expect(signals[0]!.type).toBe("funding_round");
    expect(signals[0]!.impact).toBe("positive");
    expect(signals[0]!.summary).toContain("25.0M");
    delete process.env["CRUNCHBASE_API_KEY"];
  });

  it("returns [] when API returns no funding data", async () => {
    process.env["CRUNCHBASE_API_KEY"] = "cb_key_123";
    mockHttpResponse({ data: { properties: {} } });

    const { checkFundingEvents } = await import("../../src/sync/external-signals.js");
    const signals = await checkFundingEvents("acme.com");

    expect(signals).toEqual([]);
    delete process.env["CRUNCHBASE_API_KEY"];
  });

  it("returns [] and does not throw on network error", async () => {
    process.env["CRUNCHBASE_API_KEY"] = "cb_key_123";
    const req = mockHttpError(new Error("timeout"));

    const { checkFundingEvents } = await import("../../src/sync/external-signals.js");
    const p = checkFundingEvents("acme.com");
    req._trigger();
    const signals = await p;

    expect(signals).toEqual([]);
    delete process.env["CRUNCHBASE_API_KEY"];
  });
});

// ─── enrichContact ────────────────────────────────────────────────────────────

describe("enrichContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env["CLEARBIT_API_KEY"];
  });

  it("returns null when no CLEARBIT_API_KEY", async () => {
    const { enrichContact } = await import("../../src/sync/external-signals.js");
    const result = await enrichContact("alice@acme.com");
    expect(result).toBeNull();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("returns enriched data when API responds", async () => {
    process.env["CLEARBIT_API_KEY"] = "cl_key_abc";
    mockHttpResponse({
      name: { fullName: "Alice Smith" },
      employment: { title: "VP Engineering", name: "Acme Corp" },
    });

    const { enrichContact } = await import("../../src/sync/external-signals.js");
    const result = await enrichContact("alice@acme.com");

    expect(result?.name).toBe("Alice Smith");
    expect(result?.title).toBe("VP Engineering");
    expect(result?.company).toBe("Acme Corp");
    delete process.env["CLEARBIT_API_KEY"];
  });

  it("returns null on network error", async () => {
    process.env["CLEARBIT_API_KEY"] = "cl_key_abc";
    const req = mockHttpError(new Error("forbidden"));

    const { enrichContact } = await import("../../src/sync/external-signals.js");
    const p = enrichContact("alice@acme.com");
    req._trigger();
    const result = await p;

    expect(result).toBeNull();
    delete process.env["CLEARBIT_API_KEY"];
  });
});

// ─── fetchSignalsForCustomer ──────────────────────────────────────────────────

describe("fetchSignalsForCustomer", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env["CRUNCHBASE_API_KEY"];
  });

  it("calls checkCompanyNews and merges slug into signals", async () => {
    mockHttpResponse({
      hits: [{ objectID: "1", title: "Acme raises $5M", created_at: "2026-05-01" }],
    });
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    const { fetchSignalsForCustomer } = await import("../../src/sync/external-signals.js");
    const signals = await fetchSignalsForCustomer(DATA_DIR, "acme", "acme.com", "Acme", TODAY);

    expect(signals.every((s) => s.slug === "acme")).toBe(true);
  });

  it("writes signals file when signals found", async () => {
    mockHttpResponse({
      hits: [{ objectID: "2", title: "Acme acquires Beta", created_at: "2026-05-01" }],
    });
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    const { fetchSignalsForCustomer, signalsFilePath } =
      await import("../../src/sync/external-signals.js");
    await fetchSignalsForCustomer(DATA_DIR, "acme", "acme.com", "Acme", TODAY);

    const fs = (await import("fs")).default;
    expect(fs.existsSync(signalsFilePath(DATA_DIR, "acme", TODAY))).toBe(true);
  });

  it("does not write file when no signals found", async () => {
    // HN returns no matching hits
    mockHttpResponse({
      hits: [{ objectID: "3", title: "Unrelated cats article", created_at: "2026-05-01" }],
    });
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    const { fetchSignalsForCustomer, signalsFilePath } =
      await import("../../src/sync/external-signals.js");
    await fetchSignalsForCustomer(DATA_DIR, "acme", "acme.com", "Acme", TODAY);

    const fs = (await import("fs")).default;
    expect(fs.existsSync(signalsFilePath(DATA_DIR, "acme", TODAY))).toBe(false);
  });

  it("includes crunchbase signals when key present", async () => {
    process.env["CRUNCHBASE_API_KEY"] = "key";
    // HN: no match; Crunchbase: funding
    mockHttpResponse({ hits: [] }); // HN
    mockHttpResponse({
      // Crunchbase
      data: {
        properties: { last_funding_type: "series_a", funding_total: { value_usd: 10_000_000 } },
      },
    });
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    const { fetchSignalsForCustomer } = await import("../../src/sync/external-signals.js");
    const signals = await fetchSignalsForCustomer(DATA_DIR, "acme", "acme.com", "Acme", TODAY);

    expect(signals.some((s) => s.source === "crunchbase")).toBe(true);
    delete process.env["CRUNCHBASE_API_KEY"];
  });
});
