import { describe, it, expect } from "vitest";
import {
  trackingMode,
  openTrackingEnabled,
  clickTrackingEnabled,
  replyTrackingEnabled,
  signToken,
  verifyToken,
  injectOpenPixel,
  rewriteLinks,
  isInternalDomain,
  transparentGif,
  type TrackingPayload,
} from "../../src/core/email-tracking.js";

const env = (mode?: string): NodeJS.ProcessEnv => ({ DXCRM_EMAIL_TRACKING: mode }) as never;

describe("trackingMode", () => {
  it("defaults to off and parses valid modes", () => {
    expect(trackingMode({} as never)).toBe("off");
    expect(trackingMode(env("garbage"))).toBe("off");
    expect(trackingMode(env("all"))).toBe("all");
    expect(trackingMode(env("OPENS"))).toBe("opens");
  });

  it("feature flags follow the mode", () => {
    expect(replyTrackingEnabled("reply")).toBe(true);
    expect(replyTrackingEnabled("off")).toBe(false);
    expect(openTrackingEnabled("opens")).toBe(true);
    expect(openTrackingEnabled("reply")).toBe(false);
    expect(clickTrackingEnabled("all")).toBe(true);
    expect(clickTrackingEnabled("opens")).toBe(false);
  });
});

describe("signToken / verifyToken", () => {
  const payload: TrackingPayload = { s: "acme", m: "msg-1", c: "a@acme.com", k: "open" };

  it("round-trips a valid token", () => {
    const t = signToken(payload);
    expect(verifyToken(t)).toEqual(payload);
  });

  it("rejects a tampered signature", () => {
    const t = signToken(payload);
    expect(verifyToken(t.slice(0, -2) + "00")).toBeNull();
  });

  it("rejects a tampered payload (no open-redirect)", () => {
    const t = signToken({ ...payload, k: "click", u: "https://good.example" });
    const [, sig] = t.split(".");
    const evil = Buffer.from(
      JSON.stringify({ ...payload, k: "click", u: "https://evil.example" }),
      "utf-8"
    ).toString("base64url");
    expect(verifyToken(`${evil}.${sig}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyToken("nodot")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });
});

describe("HTML transforms", () => {
  it("injects the open pixel before </body>", () => {
    const out = injectOpenPixel("<html><body>Hi</body></html>", "https://crm.test", "TOK");
    expect(out).toContain('src="https://crm.test/t/o/TOK.gif"');
    expect(out.indexOf("/t/o/TOK.gif")).toBeLessThan(out.indexOf("</body>"));
  });

  it("rewrites http(s) links through the click endpoint with a signed token", () => {
    const html = '<a href="https://acme.com/deal">click</a>';
    const out = rewriteLinks(html, "https://crm.test", (u) => `tok(${u})`);
    expect(out).toContain('href="https://crm.test/t/c/tok(https://acme.com/deal)"');
  });

  it("does not rewrite the tracking host itself", () => {
    const html = '<a href="https://crm.test/t/c/x">x</a>';
    expect(rewriteLinks(html, "https://crm.test", () => "NO")).toBe(html);
  });
});

describe("isInternalDomain", () => {
  it("matches configured internal domains", () => {
    const e = { DXCRM_INTERNAL_DOMAINS: "datasynx.io, internal.test" } as never;
    expect(isInternalDomain("me@datasynx.io", e)).toBe(true);
    expect(isInternalDomain("x@INTERNAL.TEST", e)).toBe(true);
    expect(isInternalDomain("buyer@acme.com", e)).toBe(false);
  });
});

describe("transparentGif", () => {
  it("returns a small GIF buffer", () => {
    const gif = transparentGif();
    expect(gif.subarray(0, 3).toString("ascii")).toBe("GIF");
    expect(gif.length).toBeGreaterThan(20);
  });
});
