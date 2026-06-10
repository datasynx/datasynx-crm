import { readUnmatched } from "../fs/unmatched-transcripts.js";
import { emitEvent } from "./webhooks.js";
import { logger } from "./logger.js";

/**
 * Daily digest for the unmatched-transcripts queue (#66): without an active
 * push, queued transcripts pile up silently. The daemon calls this once a day;
 * when the queue is non-empty it warns and emits `queue.unmatched_digest` so
 * workflow automation (#48) can notify whoever fixes `main_facts`.
 */
export interface UnmatchedDigest {
  count: number;
  oldest: string;
}

export async function emitUnmatchedDigest(dataDir: string): Promise<UnmatchedDigest | null> {
  const queue = readUnmatched(dataDir);
  if (queue.length === 0) return null;

  const oldest = queue.reduce((min, t) => (t.addedAt < min ? t.addedAt : min), queue[0]!.addedAt);
  const digest: UnmatchedDigest = { count: queue.length, oldest };

  await emitEvent(dataDir, "queue.unmatched_digest", {
    ...digest,
    refs: queue.slice(0, 20).map((t) => t.filePath),
  }).catch(() => undefined);

  logger.warn("transcripts", "unmatched queue needs attention", {
    count: digest.count,
    oldest,
    hint: "dxcrm transcripts unmatched / resolve <ref>",
  });
  return digest;
}
