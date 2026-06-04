import { describe, it, expect, vi } from "vitest";
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshGoogleToken,
  GMAIL_IMAP_SCOPE,
  type GoogleOAuthClient,
} from "../../../src/sync/oauth/google.js";

function fakeClient(over: Partial<GoogleOAuthClient> = {}): GoogleOAuthClient {
  return {
    generateAuthUrl: (opts) =>
      `https://accounts.google.com/o/oauth2/auth?scope=${opts.scope}&access_type=${opts.access_type}&prompt=${opts.prompt}`,
    getToken: () => Promise.resolve({ tokens: {} }),
    setCredentials: () => undefined,
    refreshAccessToken: () => Promise.resolve({ credentials: {} }),
    ...over,
  };
}

describe("buildAuthUrl", () => {
  it("requests the full mail scope with offline access and forced consent", () => {
    const url = buildAuthUrl(fakeClient());
    expect(url).toContain(encodeURIComponent ? GMAIL_IMAP_SCOPE : GMAIL_IMAP_SCOPE);
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
  });
});

describe("exchangeCodeForTokens", () => {
  it("maps Google tokens and expiry", async () => {
    const client = fakeClient({
      getToken: () =>
        Promise.resolve({
          tokens: { access_token: "AT", refresh_token: "RT", expiry_date: 1234 },
        }),
    });
    const tokens = await exchangeCodeForTokens(client, "code");
    expect(tokens).toEqual({ accessToken: "AT", refreshToken: "RT", expiresAt: 1234 });
  });

  it("defaults expiry when Google omits it", async () => {
    const client = fakeClient({
      getToken: () => Promise.resolve({ tokens: { access_token: "AT" } }),
    });
    const tokens = await exchangeCodeForTokens(client, "code", () => 1000);
    expect(tokens.expiresAt).toBe(1000 + 3600_000);
  });

  it("throws when no access token is returned", async () => {
    await expect(exchangeCodeForTokens(fakeClient(), "code")).rejects.toThrow(/access token/);
  });
});

describe("refreshGoogleToken", () => {
  it("refreshes via the refresh token and preserves it", async () => {
    const setCredentials = vi.fn();
    const factory = (): GoogleOAuthClient =>
      fakeClient({
        setCredentials,
        refreshAccessToken: () =>
          Promise.resolve({ credentials: { access_token: "NEW", expiry_date: 9999 } }),
      });
    const tokens = await refreshGoogleToken("id", "secret", "RT", factory);
    expect(setCredentials).toHaveBeenCalledWith({ refresh_token: "RT" });
    expect(tokens).toEqual({ accessToken: "NEW", refreshToken: "RT", expiresAt: 9999 });
  });
});
