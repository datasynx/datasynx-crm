import path from "path";
import { readJsonFile, writeJsonFile } from "./json-store.js";

/**
 * Unmatched-conversations queue (#75): inbound web-chat / WhatsApp threads that
 * could not be routed to a customer. Mirrors the transcript queue
 * (`unmatched-transcripts.ts`) but keyed by conversation id so a thread is queued
 * at most once and can be drained when it is later linked.
 */
export interface UnmatchedConversation {
  id: string; // conversation id (conv_…) — the resolve ref
  channel: string; // "web" | "whatsapp" | …
  threadKey: string;
  contact: { name?: string; email?: string; phone?: string };
  addedAt: string; // ISO timestamp
  reason: "no_customer_match" | "no_contact_identifier";
}

function queuePath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "unmatched-conversations.json");
}

export function readUnmatchedConversations(dataDir: string): UnmatchedConversation[] {
  return readJsonFile<UnmatchedConversation[]>(queuePath(dataDir), []);
}

/** Append one entry; idempotent by id — returns false when the id was already queued. */
export function appendUnmatchedConversation(
  dataDir: string,
  entry: UnmatchedConversation
): boolean {
  const queue = readUnmatchedConversations(dataDir);
  if (queue.some((c) => c.id === entry.id)) return false;
  writeJsonFile(queuePath(dataDir), [...queue, entry]);
  return true;
}

/** Remove a single entry by conversation id; returns false when nothing matched. */
export function removeUnmatchedConversation(dataDir: string, id: string): boolean {
  const queue = readUnmatchedConversations(dataDir);
  const next = queue.filter((c) => c.id !== id);
  if (next.length === queue.length) return false;
  writeJsonFile(queuePath(dataDir), next);
  return true;
}

export function clearUnmatchedConversations(dataDir: string): void {
  writeJsonFile(queuePath(dataDir), []);
}
