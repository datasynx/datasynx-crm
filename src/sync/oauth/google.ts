// src/sync/oauth/google.ts
//
// Google OAuth2 for Gmail IMAP (XOAUTH2). IMAP requires the FULL mail scope
// `https://mail.google.com/` — the gmail.readonly scope does NOT grant IMAP.
import { OAuth2Client } from "google-auth-library";

export const GMAIL_IMAP_SCOPE = "https://mail.google.com/";
/** Loopback redirect for the desktop/installed-app flow. */
export const DEFAULT_REDIRECT = "http://127.0.0.1";

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/** Minimal slice of OAuth2Client we use (lets tests inject a fake). */
export interface GoogleOAuthClient {
  generateAuthUrl(opts: {
    access_type?: string;
    scope?: string | string[];
    prompt?: string;
    redirect_uri?: string;
  }): string;
  getToken(code: string): Promise<{
    tokens: {
      access_token?: string | null;
      refresh_token?: string | null;
      expiry_date?: number | null;
    };
  }>;
  setCredentials(creds: { refresh_token?: string }): void;
  refreshAccessToken(): Promise<{
    credentials: { access_token?: string | null; expiry_date?: number | null };
  }>;
}

/** Build a real Google OAuth2 client for an installed/desktop app. */
export function createOAuthClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string = DEFAULT_REDIRECT
): GoogleOAuthClient {
  return new OAuth2Client(clientId, clientSecret, redirectUri) as unknown as GoogleOAuthClient;
}

/** The consent URL — offline access + forced consent so a refresh token is issued. */
export function buildAuthUrl(client: GoogleOAuthClient, redirectUri?: string): string {
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_IMAP_SCOPE,
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  });
}

/** Exchange an authorization code for tokens. */
export async function exchangeCodeForTokens(
  client: GoogleOAuthClient,
  code: string,
  now: () => number = Date.now
): Promise<GoogleTokens> {
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google did not return an access token");
  return {
    accessToken: tokens.access_token,
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    expiresAt: tokens.expiry_date ?? now() + 3600_000,
  };
}

/** Mint a fresh access token from a stored refresh token. */
export async function refreshGoogleToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  clientFactory: (id: string, secret: string) => GoogleOAuthClient = createOAuthClient,
  now: () => number = Date.now
): Promise<GoogleTokens> {
  const client = clientFactory(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) throw new Error("Google refresh did not return an access token");
  return {
    accessToken: credentials.access_token,
    refreshToken,
    expiresAt: credentials.expiry_date ?? now() + 3600_000,
  };
}
