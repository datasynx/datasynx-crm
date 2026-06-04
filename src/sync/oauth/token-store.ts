// src/sync/oauth/token-store.ts
import fs from "fs";
import path from "path";
import { writeFileAtomic } from "../../fs/atomic-write.js";

export type MailboxProvider = "gmail" | "microsoft" | "imap";

export interface MailboxToken {
  provider: MailboxProvider;
  /** Mailbox login (email address). */
  user: string;
  accessToken: string;
  /** Long-lived refresh token used to mint new access tokens. */
  refreshToken?: string;
  /** Access-token expiry as epoch milliseconds. */
  expiresAt: number;
  scope?: string;
}

function tokensPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "mailbox-tokens.json");
}

function keyOf(provider: MailboxProvider, user: string): string {
  return `${provider}:${user.toLowerCase()}`;
}

function readAll(dataDir: string): Record<string, MailboxToken> {
  const file = tokensPath(dataDir);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8") as string) as Record<string, MailboxToken>;
  } catch {
    return {};
  }
}

/** Persist (upsert) a mailbox OAuth token. */
export function saveMailboxToken(dataDir: string, token: MailboxToken): void {
  const all = readAll(dataDir);
  all[keyOf(token.provider, token.user)] = token;
  const file = tokensPath(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(all, null, 2));
}

/** Load a stored token for a provider+user, or undefined. */
export function loadMailboxToken(
  dataDir: string,
  provider: MailboxProvider,
  user: string
): MailboxToken | undefined {
  return readAll(dataDir)[keyOf(provider, user)];
}

/** List all stored mailbox tokens. */
export function listMailboxTokens(dataDir: string): MailboxToken[] {
  return Object.values(readAll(dataDir));
}

/** True when the access token is missing or expires within `skewMs` (default 60s). */
export function isTokenExpired(token: MailboxToken, skewMs = 60_000, now = Date.now()): boolean {
  return !token.accessToken || token.expiresAt <= now + skewMs;
}
