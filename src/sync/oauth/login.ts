// src/sync/oauth/login.ts
import { saveMailboxToken, type MailboxToken } from "./token-store.js";
import {
  createOAuthClient,
  buildAuthUrl,
  exchangeCodeForTokens,
  DEFAULT_REDIRECT,
  type GoogleOAuthClient,
} from "./google.js";
import {
  requestDeviceCode,
  pollForToken,
  type DeviceCodeResponse,
  type MicrosoftTokens,
} from "./microsoft.js";

/** Accept either a raw auth code or the full loopback redirect URL and return the code. */
export function extractAuthCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("code=")) {
    const m = trimmed.match(/[?&]code=([^&\s]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  return trimmed;
}

export interface GmailLoginOptions {
  dataDir: string;
  clientId: string;
  clientSecret: string;
  user: string;
  prompt: (question: string) => Promise<string>;
  print: (line: string) => void;
  redirectUri?: string;
  // Injection points for tests:
  createClient?: (id: string, secret: string, redirect: string) => GoogleOAuthClient;
  exchange?: typeof exchangeCodeForTokens;
}

/**
 * Drive the Gmail installed-app OAuth flow: show the consent URL, read back the
 * authorization code (or the pasted redirect URL), exchange it for tokens with
 * the full `mail.google.com` IMAP scope, and persist them.
 */
export async function runGmailLogin(opts: GmailLoginOptions): Promise<MailboxToken> {
  const redirect = opts.redirectUri ?? DEFAULT_REDIRECT;
  const create = opts.createClient ?? createOAuthClient;
  const exchange = opts.exchange ?? exchangeCodeForTokens;

  const client = create(opts.clientId, opts.clientSecret, redirect);
  const authUrl = buildAuthUrl(client, redirect);

  opts.print("Authorize Gmail IMAP access by visiting this URL:\n");
  opts.print(authUrl + "\n");
  opts.print(
    "After approving, your browser is redirected to a 127.0.0.1 URL that won't load — " +
      "copy that whole URL (or just the code) and paste it here."
  );

  const answer = await opts.prompt("Paste the redirect URL or code: ");
  const code = extractAuthCode(answer);
  if (!code) throw new Error("No authorization code provided.");

  const tokens = await exchange(client, code);
  if (!tokens.refreshToken) {
    opts.print(
      "Warning: Google did not return a refresh token. Remove the app's access at " +
        "myaccount.google.com/permissions and log in again to force a fresh consent."
    );
  }

  const token: MailboxToken = {
    provider: "gmail",
    user: opts.user,
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    expiresAt: tokens.expiresAt,
    scope: "https://mail.google.com/",
  };
  saveMailboxToken(opts.dataDir, token);
  return token;
}

export interface MicrosoftLoginOptions {
  dataDir: string;
  clientId: string;
  user: string;
  tenant?: string;
  print: (line: string) => void;
  // Injection points for tests:
  requestDeviceCodeFn?: (clientId: string, tenant: string) => Promise<DeviceCodeResponse>;
  pollFn?: (opts: {
    clientId: string;
    deviceCode: string;
    tenant: string;
    interval: number;
    expiresIn: number;
  }) => Promise<MicrosoftTokens>;
}

/**
 * Drive the Microsoft device-code flow: print the short user code + URL, poll
 * until the user authorizes, and persist the IMAP tokens.
 */
export async function runMicrosoftLogin(opts: MicrosoftLoginOptions): Promise<MailboxToken> {
  const tenant = opts.tenant ?? "common";
  const requestCode =
    opts.requestDeviceCodeFn ?? ((id: string, t: string) => requestDeviceCode(id, t));
  const poll =
    opts.pollFn ??
    ((o: {
      clientId: string;
      deviceCode: string;
      tenant: string;
      interval: number;
      expiresIn: number;
    }) => pollForToken(o));

  const device = await requestCode(opts.clientId, tenant);
  opts.print(`\nTo sign in, open ${device.verification_uri} and enter code: ${device.user_code}\n`);
  opts.print("Waiting for authorization…");

  const tokens = await poll({
    clientId: opts.clientId,
    deviceCode: device.device_code,
    tenant,
    interval: device.interval,
    expiresIn: device.expires_in,
  });

  const token: MailboxToken = {
    provider: "microsoft",
    user: opts.user,
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    expiresAt: tokens.expiresAt,
    scope: "https://outlook.office365.com/IMAP.AccessAsUser.All",
  };
  saveMailboxToken(opts.dataDir, token);
  return token;
}
