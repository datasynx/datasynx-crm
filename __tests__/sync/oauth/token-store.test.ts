import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  saveMailboxToken,
  loadMailboxToken,
  listMailboxTokens,
  isTokenExpired,
  type MailboxToken,
} from "../../../src/sync/oauth/token-store.js";

beforeEach(() => vol.reset());

const tok = (over: Partial<MailboxToken> = {}): MailboxToken => ({
  provider: "gmail",
  user: "Me@Example.com",
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: Date.now() + 3600_000,
  ...over,
});

describe("token-store", () => {
  it("saves and loads a token (case-insensitive user)", () => {
    saveMailboxToken("/data", tok());
    const loaded = loadMailboxToken("/data", "gmail", "me@example.com");
    expect(loaded?.accessToken).toBe("at");
    expect(loaded?.refreshToken).toBe("rt");
  });

  it("upserts by provider+user and lists all", () => {
    saveMailboxToken("/data", tok({ accessToken: "a1" }));
    saveMailboxToken("/data", tok({ accessToken: "a2" }));
    saveMailboxToken("/data", tok({ provider: "microsoft", user: "x@org.com", accessToken: "b" }));
    expect(loadMailboxToken("/data", "gmail", "me@example.com")?.accessToken).toBe("a2");
    expect(listMailboxTokens("/data")).toHaveLength(2);
  });

  it("returns undefined for unknown token", () => {
    expect(loadMailboxToken("/data", "gmail", "nobody@x.com")).toBeUndefined();
  });

  it("persists to .agentic/mailbox-tokens.json", () => {
    saveMailboxToken("/data", tok());
    expect(vol.toJSON()["/data/.agentic/mailbox-tokens.json"]).toContain("gmail:me@example.com");
  });
});

describe("isTokenExpired", () => {
  it("is false for a fresh token", () => {
    expect(isTokenExpired(tok({ expiresAt: Date.now() + 3600_000 }))).toBe(false);
  });
  it("is true within the skew window", () => {
    expect(isTokenExpired(tok({ expiresAt: Date.now() + 1000 }))).toBe(true);
  });
  it("is true when access token is empty", () => {
    expect(isTokenExpired(tok({ accessToken: "" }))).toBe(true);
  });
});
