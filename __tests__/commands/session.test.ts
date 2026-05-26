import { describe, it, expect } from "vitest";
import { setSession, getSession, clearSession } from "../../src/core/session-store.js";

describe("session store", () => {
  it("stores and retrieves session", () => {
    setSession({ customerSlug: "acme", customerName: "Acme", startedAt: "2026-01-01" });
    const s = getSession();
    expect(s?.customerSlug).toBe("acme");
  });

  it("clears session", () => {
    setSession({ customerSlug: "acme", customerName: "Acme", startedAt: "2026-01-01" });
    clearSession();
    expect(getSession()).toBeNull();
  });

  it("stores customerName", () => {
    setSession({ customerSlug: "beta", customerName: "Beta Inc", startedAt: "2026-01-01" });
    expect(getSession()?.customerName).toBe("Beta Inc");
  });

  it("stores startedAt", () => {
    const ts = "2026-05-25T10:00:00.000Z";
    setSession({ customerSlug: "test", customerName: "Test Co", startedAt: ts });
    expect(getSession()?.startedAt).toBe(ts);
  });

  it("overwrites previous session", () => {
    setSession({ customerSlug: "acme", customerName: "Acme", startedAt: "2026-01-01" });
    setSession({ customerSlug: "beta", customerName: "Beta Inc", startedAt: "2026-01-02" });
    expect(getSession()?.customerSlug).toBe("beta");
  });

  it("returns null when no session is active", () => {
    clearSession();
    expect(getSession()).toBeNull();
  });
});
