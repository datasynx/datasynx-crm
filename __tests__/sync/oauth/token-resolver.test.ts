import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import { getFreshAccessToken } from "../../../src/sync/oauth/token-resolver.js";
import { saveMailboxToken, loadMailboxToken } from "../../../src/sync/oauth/token-store.js";

beforeEach(() => vol.reset());

describe("getFreshAccessToken", () => {
  it("returns the stored token when it is still valid", async () => {
    saveMailboxToken("/data", {
      provider: "gmail",
      user: "me@x.com",
      accessToken: "valid",
      refreshToken: "rt",
      expiresAt: Date.now() + 3600_000,
    });
    const at = await getFreshAccessToken("/data", "gmail", "me@x.com");
    expect(at).toBe("valid");
  });

  it("throws when no token is stored", async () => {
    await expect(getFreshAccessToken("/data", "gmail", "nobody@x.com")).rejects.toThrow(
      /mailbox login gmail/
    );
  });

  it("refreshes an expired Gmail token and persists it", async () => {
    saveMailboxToken("/data", {
      provider: "gmail",
      user: "me@x.com",
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: Date.now() - 1000,
    });
    const refreshGoogle = vi.fn().mockResolvedValue({
      accessToken: "fresh",
      refreshToken: "rt",
      expiresAt: Date.now() + 3600_000,
    });

    const at = await getFreshAccessToken("/data", "gmail", "me@x.com", {
      env: {
        DXCRM_GOOGLE_CLIENT_ID: "id",
        DXCRM_GOOGLE_CLIENT_SECRET: "secret",
      } as NodeJS.ProcessEnv,
      refreshGoogle: refreshGoogle as never,
    });

    expect(at).toBe("fresh");
    expect(refreshGoogle).toHaveBeenCalledWith("id", "secret", "rt");
    expect(loadMailboxToken("/data", "gmail", "me@x.com")?.accessToken).toBe("fresh");
  });

  it("refreshes an expired Microsoft token (rotating refresh token)", async () => {
    saveMailboxToken("/data", {
      provider: "microsoft",
      user: "me@org.com",
      accessToken: "old",
      refreshToken: "rt1",
      expiresAt: Date.now() - 1000,
    });
    const refreshMicrosoft = vi.fn().mockResolvedValue({
      accessToken: "fresh",
      refreshToken: "rt2",
      expiresAt: Date.now() + 3600_000,
    });

    const at = await getFreshAccessToken("/data", "microsoft", "me@org.com", {
      env: { DXCRM_MS_CLIENT_ID: "msid" } as NodeJS.ProcessEnv,
      refreshMicrosoft: refreshMicrosoft as never,
    });

    expect(at).toBe("fresh");
    expect(refreshMicrosoft).toHaveBeenCalledWith("msid", "rt1", "common");
    expect(loadMailboxToken("/data", "microsoft", "me@org.com")?.refreshToken).toBe("rt2");
  });

  it("throws when client credentials are missing for a refresh", async () => {
    saveMailboxToken("/data", {
      provider: "gmail",
      user: "me@x.com",
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: Date.now() - 1000,
    });
    await expect(
      getFreshAccessToken("/data", "gmail", "me@x.com", { env: {} as NodeJS.ProcessEnv })
    ).rejects.toThrow(/DXCRM_GOOGLE_CLIENT_ID/);
  });
});
