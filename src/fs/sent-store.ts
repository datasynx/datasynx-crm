import fs from "fs";
import path from "path";

/**
 * Outbound email tracking stores (#45), both append-only NDJSON under .agentic:
 *  - sent-mail.ndjson: one record per outbound message
 *  - email-events.ndjson: sent | open | click | reply events
 */

export interface SentMail {
  messageId: string;
  threadId?: string;
  slug: string;
  contactEmail: string;
  subject?: string;
  sequenceStep?: number;
  sentAt: string; // ISO
  /** set once a reply has been correlated, so we don't double-count */
  repliedAt?: string;
}

export type EmailEventType = "sent" | "open" | "click" | "reply";

export interface EmailEvent {
  type: EmailEventType;
  slug: string;
  contactEmail: string;
  messageId?: string;
  threadId?: string;
  at: string; // ISO
  /** reply latency in hours (reply events) */
  latencyHours?: number;
  /** click target URL (click events) */
  url?: string;
}

function sentPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "sent-mail.ndjson");
}
function eventsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "email-events.ndjson");
}

function readNdjson<T>(p: string): T[] {
  if (!fs.existsSync(p)) return [];
  const out: T[] = [];
  for (const line of (fs.readFileSync(p, "utf-8") as string).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as T);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

function appendNdjson(p: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(obj) + "\n", "utf-8");
}

// ─── Sent mail ────────────────────────────────────────────────────────────────

export function recordSentMail(dataDir: string, mail: SentMail): void {
  appendNdjson(sentPath(dataDir), mail);
  appendEmailEvent(dataDir, {
    type: "sent",
    slug: mail.slug,
    contactEmail: mail.contactEmail,
    messageId: mail.messageId,
    ...(mail.threadId ? { threadId: mail.threadId } : {}),
    at: mail.sentAt,
  });
}

export function readSentMail(dataDir: string): SentMail[] {
  return readNdjson<SentMail>(sentPath(dataDir));
}

/** Most-recent un-replied sent record matching a thread id. */
export function findSentByThread(dataDir: string, threadId: string): SentMail | undefined {
  return readSentMail(dataDir)
    .filter((m) => m.threadId === threadId && !m.repliedAt)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
}

// ─── Events ─────────────────────────────────────────────────────────────────

export function appendEmailEvent(dataDir: string, event: EmailEvent): void {
  appendNdjson(eventsPath(dataDir), event);
}

export function readEmailEvents(dataDir: string): EmailEvent[] {
  return readNdjson<EmailEvent>(eventsPath(dataDir));
}

/**
 * Correlate an inbound message with a prior outbound one by thread id (no pixel
 * needed). Records a `reply` event with latency and stamps the sent record so a
 * thread only counts one reply. Returns the reply event, or null when no match.
 */
export function correlateReply(
  dataDir: string,
  inbound: { threadId?: string; from?: string; at: string }
): EmailEvent | null {
  if (!inbound.threadId) return null;
  const sent = findSentByThread(dataDir, inbound.threadId);
  if (!sent) return null;

  const latencyHours =
    (new Date(inbound.at).getTime() - new Date(sent.sentAt).getTime()) / 3_600_000;

  const event: EmailEvent = {
    type: "reply",
    slug: sent.slug,
    contactEmail: sent.contactEmail,
    messageId: sent.messageId,
    threadId: sent.threadId ?? inbound.threadId,
    at: inbound.at,
    latencyHours: Math.max(0, Math.round(latencyHours * 10) / 10),
  };
  appendEmailEvent(dataDir, event);

  // Stamp the sent record (rewrite the NDJSON) so we don't double-count.
  const all = readSentMail(dataDir).map((m) =>
    m.messageId === sent.messageId ? { ...m, repliedAt: inbound.at } : m
  );
  fs.writeFileSync(sentPath(dataDir), all.map((m) => JSON.stringify(m)).join("\n") + "\n", "utf-8");

  return event;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export interface ContactEngagement {
  contactEmail: string;
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  lastOpenAt?: string;
  lastReplyAt?: string;
  /** average reply latency in hours across correlated replies */
  avgReplyLatencyHours?: number;
}

/** Aggregate events for a customer into per-contact engagement summaries. */
export function aggregateEngagement(dataDir: string, slug: string): ContactEngagement[] {
  const byContact = new Map<string, ContactEngagement>();
  const latencies = new Map<string, number[]>();

  for (const e of readEmailEvents(dataDir)) {
    if (e.slug !== slug) continue;
    const c =
      byContact.get(e.contactEmail) ??
      ({
        contactEmail: e.contactEmail,
        sent: 0,
        opens: 0,
        clicks: 0,
        replies: 0,
      } as ContactEngagement);
    if (e.type === "sent") c.sent++;
    else if (e.type === "open") {
      c.opens++;
      if (!c.lastOpenAt || e.at > c.lastOpenAt) c.lastOpenAt = e.at;
    } else if (e.type === "click") c.clicks++;
    else if (e.type === "reply") {
      c.replies++;
      if (!c.lastReplyAt || e.at > c.lastReplyAt) c.lastReplyAt = e.at;
      if (e.latencyHours !== undefined) {
        const arr = latencies.get(e.contactEmail) ?? [];
        arr.push(e.latencyHours);
        latencies.set(e.contactEmail, arr);
      }
    }
    byContact.set(e.contactEmail, c);
  }

  for (const [email, arr] of latencies) {
    const c = byContact.get(email);
    if (c && arr.length > 0) {
      c.avgReplyLatencyHours = Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
    }
  }

  return [...byContact.values()].sort((a, b) => b.opens + b.clicks - (a.opens + a.clicks));
}
