import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import {
  extractAuthCode,
  runGmailLogin,
  runMicrosoftLogin,
} from "../../../src/sync/oauth/login.js";
import { loadMailboxToken } from "../../../src/sync/oauth/token-store.js";
import type { GoogleOAuthClient } from "../../../src/sync/oauth/google.js";

beforeEach(() => vol.reset());

describe("extractAuthCode", () => {
  it("returns a raw code unchanged", () => {
    expect(extractAuthCode("4/abc-DEF_123")).toBe("4/abc-DEF_123");
  });
  it("extracts the code from a redirect URL", () => {
    expect(extractAuthCode("http://127.0.0.1:8080/?code=4%2Fxyz&scope=mail")).toBe("4/xyz");
  });
});

describe("runGmailLogin", () => {
  it("runs the flow and persists a gmail token", async () => {
    const fakeClient: GoogleOAuthClient = {
      generateAuthUrl: () => "https://consent.url",
      getToken: () => Promise.resolve({ tokens: {} }),
      setCredentials: () => undefined,
      refreshAccessToken: () => Promise.resolve({ credentials: {} }),
    };
    const exchange = vi
      .fn()
      .mockResolvedValue({ accessToken: "AT", refreshToken: "RT", expiresAt: 123 });
    const printed: string[] = [];

    const token = await runGmailLogin({
      dataDir: "/data",
      clientId: "id",
      clientSecret: "secret",
      user: "me@gmail.com",
      prompt: () => Promise.resolve("http://127.0.0.1/?code=THECODE"),
      print: (l) => printed.push(l),
      createClient: () => fakeClient,
      exchange: exchange as never,
    });

    expect(exchange).toHaveBeenCalledWith(fakeClient, "THECODE");
    expect(token.accessToken).toBe("AT");
    expect(loadMailboxToken("/data", "gmail", "me@gmail.com")?.refreshToken).toBe("RT");
    expect(printed.join("\n")).toContain("https://consent.url");
  });

  it("throws when no code is provided", async () => {
    await expect(
      runGmailLogin({
        dataDir: "/data",
        clientId: "id",
        clientSecret: "secret",
        user: "me@gmail.com",
        prompt: () => Promise.resolve("   "),
        print: () => undefined,
        createClient: () => ({
          generateAuthUrl: () => "u",
          getToken: () => Promise.resolve({ tokens: {} }),
          setCredentials: () => undefined,
          refreshAccessToken: () => Promise.resolve({ credentials: {} }),
        }),
        exchange: vi.fn() as never,
      })
    ).rejects.toThrow(/No authorization code/);
  });
});

describe("runMicrosoftLogin", () => {
  it("shows the device code and persists tokens after polling", async () => {
    const printed: string[] = [];
    const token = await runMicrosoftLogin({
      dataDir: "/data",
      clientId: "msid",
      user: "me@org.com",
      print: (l) => printed.push(l),
      requestDeviceCodeFn: () =>
        Promise.resolve({
          device_code: "dc",
          user_code: "WXYZ-1234",
          verification_uri: "https://microsoft.com/devicelogin",
          expires_in: 900,
          interval: 5,
          message: "msg",
        }),
      pollFn: () => Promise.resolve({ accessToken: "AT", refreshToken: "RT", expiresAt: 999 }),
    });

    expect(token.accessToken).toBe("AT");
    expect(loadMailboxToken("/data", "microsoft", "me@org.com")?.refreshToken).toBe("RT");
    expect(printed.join("\n")).toContain("WXYZ-1234");
    expect(printed.join("\n")).toContain("https://microsoft.com/devicelogin");
  });
});
