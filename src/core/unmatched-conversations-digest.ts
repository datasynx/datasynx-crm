import { readUnmatchedConversations } from "../fs/unmatched-conversations.js";
import { emitEvent } from "./webhooks.js";
import { logger } from "./logger.js";

/**
 * Daily digest for the unmatched-conversations queue (#75): mirrors the
 * transcript digest (#66). Without a nudge, inbound web-chat/WhatsApp threads
 * that didn't route to a customer pile up silently. The daemon calls this once a
 * day; when the queue is non-empty it warns and emits
 * `queue.unmatched_conversations_digest` so workflow automation (#48) can notify
 * whoever links them.
 */
export interface UnmatchedConversationsDigest {
  count: number;
  oldest: string;
}

export async function emitUnmatchedConversationsDigest(
  dataDir: string
): Promise<UnmatchedConversationsDigest | null> {
  const queue = readUnmatchedConversations(dataDir);
  if (queue.length === 0) return null;

  const oldest = queue.reduce((min, c) => (c.addedAt < min ? c.addedAt : min), queue[0]!.addedAt);
  const digest: UnmatchedConversationsDigest = { count: queue.length, oldest };

  await emitEvent(dataDir, "queue.unmatched_conversations_digest", {
    ...digest,
    refs: queue.slice(0, 20).map((c) => c.id),
  }).catch(() => undefined);

  logger.warn("conversations", "unmatched conversations need attention", {
    count: digest.count,
    oldest,
    hint: "dxcrm conversations unmatched / resolve <ref> <slug>",
  });
  return digest;
}
