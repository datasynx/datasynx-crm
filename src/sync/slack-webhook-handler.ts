import crypto from "crypto";
import { readSubscriptions, writeSubscriptions, type PushSubscription } from "./push-manager.js";
import { appendInteraction } from "../fs/interactions-writer.js";

export interface SlackEvent {
  type: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  bot_id?: string;
}

export function verifySlackSignature(
  body: string,
  headers: { "x-slack-signature"?: string; "x-slack-request-timestamp"?: string },
  signingSecret: string
): boolean {
  const sig = headers["x-slack-signature"];
  const ts = headers["x-slack-request-timestamp"];
  if (!sig || !ts) return false;

  // Replay protection: reject requests older than 5 minutes
  const tsNum = Number(ts);
  if (Math.abs(Date.now() / 1000 - tsNum) > 5 * 60) return false;

  const sigBase = `v0:${ts}:${body}`;
  const expected = "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBase).digest("hex");

  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export type SlackUrlVerificationResult =
  | { isVerification: true; challenge: string }
  | { isVerification: false; challenge?: never };

export function handleSlackUrlVerification(body: {
  type?: string;
  challenge?: string;
}): SlackUrlVerificationResult {
  if (body.type === "url_verification") {
    return { isVerification: true, challenge: body.challenge ?? "" };
  }
  return { isVerification: false };
}

export type AppendInteractionFn = typeof appendInteraction;
export type FetchUserInfoFn = (
  botToken: string,
  userId: string
) => Promise<{ email?: string; name?: string }>;

export interface HandleSlackPushOptions {
  appendInteractionFn?: AppendInteractionFn;
  fetchUserInfoFn?: FetchUserInfoFn;
  teamId?: string;
}

function findSubscriptionByTeam(
  subs: PushSubscription[],
  teamId: string | undefined
): PushSubscription | null {
  return subs.find(
    (s) => s.provider === "slack" && s.status === "active" &&
      (!teamId || s.providerData.slackTeamId === teamId)
  ) ?? null;
}

export async function handleSlackPushEvent(
  dataDir: string,
  event: SlackEvent,
  botToken: string,
  options: HandleSlackPushOptions = {}
): Promise<{ processed: number; skipped: number }> {
  // Only process message events
  if (event.type !== "message") return { processed: 0, skipped: 1 };

  // Skip bot messages
  if (event.bot_id) return { processed: 0, skipped: 1 };

  // Skip empty text
  if (!event.text?.trim()) return { processed: 0, skipped: 1 };

  const subs = await readSubscriptions(dataDir);
  const sub = findSubscriptionByTeam(subs, options.teamId);
  if (!sub) return { processed: 0, skipped: 1 };

  const { appendInteractionFn = appendInteraction, fetchUserInfoFn } = options;

  let senderName = event.user ?? "unknown";
  if (fetchUserInfoFn && event.user) {
    try {
      const info = await fetchUserInfoFn(botToken, event.user);
      senderName = info.name ?? info.email ?? event.user;
    } catch {
      // keep default
    }
  }

  const ts = event.ts ? new Date(Number(event.ts) * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const sourceRef = `slack://channel/${event.channel ?? "dm"}/ts/${event.ts ?? Date.now()}`;

  try {
    await appendInteractionFn(dataDir, sub.slug, {
      date: ts,
      type: "Meeting",
      direction: "inbound",
      with: senderName,
      subject: `Slack message in ${event.channel ?? "DM"}`,
      summary: event.text.slice(0, 300),
      nextSteps: [],
      sourceRef,
      synced: new Date().toISOString(),
    });

    // Update sub counters
    const idx = subs.findIndex((s) => s.id === sub.id);
    if (idx !== -1) {
      subs[idx] = {
        ...subs[idx]!,
        eventsProcessed: subs[idx]!.eventsProcessed + 1,
        lastEventAt: new Date().toISOString(),
      };
      await writeSubscriptions(dataDir, subs);
    }

    return { processed: 1, skipped: 0 };
  } catch {
    return { processed: 0, skipped: 1 };
  }
}
