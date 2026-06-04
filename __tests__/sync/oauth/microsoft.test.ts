import { describe, it, expect, vi } from "vitest";
import {
  requestDeviceCode,
  pollForToken,
  refreshMicrosoftToken,
  MS_IMAP_SCOPE,
} from "../../../src/sync/oauth/microsoft.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe("requestDeviceCode", () => {
  it("posts client_id + IMAP scope and returns the device code", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        device_code: "dc",
        user_code: "ABCD-EFGH",
        verification_uri: "https://microsoft.com/devicelogin",
        expires_in: 900,
        interval: 5,
        message: "go here",
      })
    );
    const res = await requestDeviceCode("client-1", "common", fetchFn as never);
    expect(res.user_code).toBe("ABCD-EFGH");
    const body = (fetchFn.mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain("client_id=client-1");
    // URLSearchParams encodes spaces as "+"; normalize before comparing.
    expect(decodeURIComponent(body.replace(/\+/g, " "))).toContain(MS_IMAP_SCOPE);
  });
});

describe("pollForToken", () => {
  it("waits through authorization_pending then returns tokens", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "authorization_pending" }, false, 400))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "AT", refresh_token: "RT", expires_in: 3600 })
      );
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const tokens = await pollForToken({
      clientId: "c",
      deviceCode: "dc",
      interval: 1,
      fetchFn: fetchFn as never,
      sleepFn,
      now: () => 1_000_000,
    });

    expect(tokens.accessToken).toBe("AT");
    expect(tokens.refreshToken).toBe("RT");
    expect(tokens.expiresAt).toBe(1_000_000 + 3600 * 1000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("backs off on slow_down", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "slow_down" }, false, 400))
      .mockResolvedValueOnce(jsonResponse({ access_token: "AT", expires_in: 3600 }));
    const sleeps: number[] = [];
    await pollForToken({
      clientId: "c",
      deviceCode: "dc",
      interval: 5,
      fetchFn: fetchFn as never,
      sleepFn: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
    });
    expect(sleeps[0]).toBe(5000);
    expect(sleeps[1]).toBe(10000); // +5s after slow_down
  });

  it("throws on access_denied", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "access_denied" }, false, 400));
    await expect(
      pollForToken({
        clientId: "c",
        deviceCode: "dc",
        fetchFn: fetchFn as never,
        sleepFn: () => Promise.resolve(),
        now: () => 0,
      })
    ).rejects.toThrow(/access_denied/);
  });

  it("throws when the device code expires", async () => {
    let t = 0;
    await expect(
      pollForToken({
        clientId: "c",
        deviceCode: "dc",
        expiresIn: 10,
        fetchFn: vi.fn() as never,
        sleepFn: () => Promise.resolve(),
        now: () => (t += 20_000),
      })
    ).rejects.toThrow(/expired/);
  });
});

describe("refreshMicrosoftToken", () => {
  it("exchanges a refresh token for a fresh access token", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ access_token: "NEW", refresh_token: "RT2", expires_in: 3600 })
      );
    const tokens = await refreshMicrosoftToken(
      "c",
      "old-rt",
      "common",
      fetchFn as never,
      () => 5000
    );
    expect(tokens.accessToken).toBe("NEW");
    expect(tokens.expiresAt).toBe(5000 + 3600 * 1000);
    const body = (fetchFn.mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain("grant_type=refresh_token");
  });

  it("throws on refresh failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "invalid_grant" }, false, 400));
    await expect(refreshMicrosoftToken("c", "bad", "common", fetchFn as never)).rejects.toThrow(
      /invalid_grant/
    );
  });
});
