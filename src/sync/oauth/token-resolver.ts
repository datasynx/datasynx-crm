// src/sync/oauth/token-resolver.ts
import {
  loadMailboxToken,
  saveMailboxToken,
  isTokenExpired,
  type MailboxProvider,
} from "./token-store.js";
import { refreshGoogleToken } from "./google.js";
import { refreshMicrosoftToken } from "./microsoft.js";
import { logger } from "../../core/logger.js";

export interface ResolverDeps {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  refreshGoogle?: typeof refreshGoogleToken;
  refreshMicrosoft?: typeof refreshMicrosoftToken;
}

/**
 * Return a valid access token for a stored mailbox account, transparently
 * refreshing it (and persisting the new token) when it has expired. Throws a
 * clear error when no token is stored or a re-login is required.
 */
export async function getFreshAccessToken(
  dataDir: string,
  provider: MailboxProvider,
  user: string,
  deps: ResolverDeps = {}
): Promise<string> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;

  const token = loadMailboxToken(dataDir, provider, user);
  if (!token) {
    throw new Error(
      `No stored ${provider} token for ${user}. Run 'dxcrm mailbox login ${provider}' first.`
    );
  }
  if (!isTokenExpired(token, 60_000, now())) return token.accessToken;
  if (!token.refreshToken) {
    throw new Error(`${provider} token for ${user} expired and has no refresh token — re-login.`);
  }

  logger.info("oauth", "refreshing mailbox access token", { provider, user });

  if (provider === "gmail") {
    const clientId = env["DXCRM_GOOGLE_CLIENT_ID"];
    const clientSecret = env["DXCRM_GOOGLE_CLIENT_SECRET"];
    if (!clientId || !clientSecret) {
      throw new Error(
        "DXCRM_GOOGLE_CLIENT_ID / DXCRM_GOOGLE_CLIENT_SECRET are required to refresh."
      );
    }
    const refresh = deps.refreshGoogle ?? refreshGoogleToken;
    const fresh = await refresh(clientId, clientSecret, token.refreshToken);
    saveMailboxToken(dataDir, {
      ...token,
      accessToken: fresh.accessToken,
      expiresAt: fresh.expiresAt,
    });
    return fresh.accessToken;
  }

  if (provider === "microsoft") {
    const clientId = env["DXCRM_MS_CLIENT_ID"];
    if (!clientId) throw new Error("DXCRM_MS_CLIENT_ID is required to refresh.");
    const tenant = env["DXCRM_MS_TENANT"] ?? "common";
    const refresh = deps.refreshMicrosoft ?? refreshMicrosoftToken;
    const fresh = await refresh(clientId, token.refreshToken, tenant);
    saveMailboxToken(dataDir, {
      ...token,
      accessToken: fresh.accessToken,
      ...(fresh.refreshToken ? { refreshToken: fresh.refreshToken } : {}),
      expiresAt: fresh.expiresAt,
    });
    return fresh.accessToken;
  }

  // "imap" provider uses a static password/token; nothing to refresh.
  return token.accessToken;
}
