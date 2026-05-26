import fs from "fs";
import path from "path";

export interface SlugSyncState {
  lastGmailSync?: string; // ISO timestamp
}

export interface SyncState {
  [slug: string]: SlugSyncState;
}

function getSyncStatePath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "sync-state.json");
}

export function readSyncState(dataDir: string): SyncState {
  const filePath = getSyncStatePath(dataDir);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8") as string) as SyncState;
  } catch {
    return {};
  }
}

export function updateSlugSyncState(
  dataDir: string,
  slug: string,
  update: Partial<SlugSyncState>
): void {
  const filePath = getSyncStatePath(dataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const state = readSyncState(dataDir);
  state[slug] = { ...state[slug], ...update };
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}
