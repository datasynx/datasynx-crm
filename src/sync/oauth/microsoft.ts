// src/sync/oauth/microsoft.ts
//
// Microsoft OAuth2 *device code* flow for IMAP access (outlook.office365.com).
// Device code suits a CLI: the user opens a URL on any device and enters a
// short code — no local redirect server or client secret (public client).

export const MS_IMAP_SCOPE = "offline_access https://outlook.office365.com/IMAP.AccessAsUser.All";

type FetchFn = typeof fetch;

function endpoint(tenant: string, kind: "devicecode" | "token"): string {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/${kind}`;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/** Start the device-code flow; returns the user code + verification URL to show. */
export async function requestDeviceCode(
  clientId: string,
  tenant = "common",
  fetchFn: FetchFn = fetch
): Promise<DeviceCodeResponse> {
  const res = await fetchFn(endpoint(tenant, "devicecode"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, scope: MS_IMAP_SCOPE }).toString(),
  });
  if (!res.ok) throw new Error(`device code request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as DeviceCodeResponse;
}

interface TokenSuccess {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}
interface TokenError {
  error: string;
  error_description?: string;
}

/**
 * Poll the token endpoint until the user authorizes (or the code expires).
 * Honors `authorization_pending` (keep waiting) and `slow_down` (back off).
 */
export async function pollForToken(opts: {
  clientId: string;
  deviceCode: string;
  tenant?: string;
  interval?: number;
  expiresIn?: number;
  fetchFn?: FetchFn;
  sleepFn?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<MicrosoftTokens> {
  const tenant = opts.tenant ?? "common";
  const fetchFn = opts.fetchFn ?? fetch;
  const sleepFn = opts.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  let intervalMs = (opts.interval ?? 5) * 1000;
  const deadline = now() + (opts.expiresIn ?? 900) * 1000;

  for (;;) {
    if (now() >= deadline) throw new Error("device code expired before authorization");
    await sleepFn(intervalMs);

    const res = await fetchFn(endpoint(tenant, "token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: opts.clientId,
        device_code: opts.deviceCode,
      }).toString(),
    });

    const data = (await res.json()) as TokenSuccess | TokenError;
    if (res.ok && "access_token" in data) {
      return tokensFromSuccess(data, now());
    }
    const err = (data as TokenError).error;
    if (err === "authorization_pending") continue;
    if (err === "slow_down") {
      intervalMs += 5000;
      continue;
    }
    throw new Error(`device flow failed: ${err}${describe(data as TokenError)}`);
  }
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshMicrosoftToken(
  clientId: string,
  refreshToken: string,
  tenant = "common",
  fetchFn: FetchFn = fetch,
  now: () => number = Date.now
): Promise<MicrosoftTokens> {
  const res = await fetchFn(endpoint(tenant, "token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
      scope: MS_IMAP_SCOPE,
    }).toString(),
  });
  const data = (await res.json()) as TokenSuccess | TokenError;
  if (!res.ok || !("access_token" in data)) {
    throw new Error(`token refresh failed: ${(data as TokenError).error ?? res.status}`);
  }
  return tokensFromSuccess(data, now());
}

function tokensFromSuccess(data: TokenSuccess, nowMs: number): MicrosoftTokens {
  return {
    accessToken: data.access_token,
    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    expiresAt: nowMs + data.expires_in * 1000,
  };
}

function describe(e: TokenError): string {
  return e.error_description ? ` (${e.error_description.split("\n")[0]})` : "";
}
