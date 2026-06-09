import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Outbound email engagement tracking (#45) — local-first, data-sparing,
 * default OFF. Tiers: reply (no pixel), opens (1x1 gif), clicks (link rewrite).
 */
export type TrackingMode = "off" | "reply" | "opens" | "clicks" | "all";

export function trackingMode(env: NodeJS.ProcessEnv = process.env): TrackingMode {
  const raw = (env["DXCRM_EMAIL_TRACKING"] ?? "off").toLowerCase().trim();
  if (raw === "reply" || raw === "opens" || raw === "clicks" || raw === "all") return raw;
  return "off";
}

/** Reply correlation works whenever tracking isn't fully off. */
export function replyTrackingEnabled(mode: TrackingMode): boolean {
  return mode !== "off";
}
export function openTrackingEnabled(mode: TrackingMode): boolean {
  return mode === "opens" || mode === "all";
}
export function clickTrackingEnabled(mode: TrackingMode): boolean {
  return mode === "clicks" || mode === "all";
}

function secret(env: NodeJS.ProcessEnv = process.env): string {
  return env["DXCRM_TRACKING_SECRET"] ?? "dxcrm-tracking-default-secret";
}

export function trackingBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env["DXCRM_SERVER_URL"] ?? "http://localhost:3847").replace(/\/+$/, "");
}

export type TrackingKind = "open" | "click";

export interface TrackingPayload {
  /** customer slug */
  s: string;
  /** outbound messageId */
  m: string;
  /** contact email */
  c: string;
  /** open | click */
  k: TrackingKind;
  /** click target URL — signed so the redirect can't be tampered (no open-redirect) */
  u?: string;
}

function b64url(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64url");
}
function unb64url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf-8");
}

/** Sign a tracking payload into an opaque, URL-safe token: `<payload>.<sig>`. */
export function signToken(payload: TrackingPayload, env: NodeJS.ProcessEnv = process.env): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  return `${body}.${sig}`;
}

/** Verify and decode a tracking token. Returns null on any tampering. */
export function verifyToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env
): TrackingPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(unb64url(body)) as TrackingPayload;
    if (!parsed.s || !parsed.m || !parsed.c || (parsed.k !== "open" && parsed.k !== "click")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** A transparent 1x1 GIF (43 bytes) for open tracking. */
export function transparentGif(): Buffer {
  return Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
}

/** Inject an open-tracking pixel just before </body> (or append). */
export function injectOpenPixel(html: string, baseUrl: string, token: string): string {
  const img = `<img src="${baseUrl}/t/o/${token}.gif" width="1" height="1" alt="" style="display:none" />`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${img}</body>`);
  return html + img;
}

/**
 * Rewrite http(s) links in `href="..."` to go through the click endpoint.
 * The destination is signed into the token, so the redirect target can't be
 * swapped (no open-redirect). `mkToken(url)` returns the signed token.
 */
export function rewriteLinks(
  html: string,
  baseUrl: string,
  mkToken: (url: string) => string
): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url: string) => {
    // Don't rewrite the tracking host itself.
    if (url.startsWith(`${baseUrl}/t/`)) return `href="${url}"`;
    return `href="${baseUrl}/t/c/${mkToken(url)}"`;
  });
}

/** Internal domains are never tracked (privacy / no self-tracking). */
export function isInternalDomain(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const list = (env["DXCRM_INTERNAL_DOMAINS"] ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return list.includes(domain);
}
