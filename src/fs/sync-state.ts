import fs from "fs";
import path from "path";

export interface SlugSyncState {
  lastGmailSync?: string;
  lastCalendarSync?: string;
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

export function writeSyncState(dataDir: string, state: SyncState): void {
  const filePath = getSyncStatePath(dataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
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

export function getLastGmailSync(dataDir: string, slug: string): Date | undefined {
  const ts = readSyncState(dataDir)[slug]?.lastGmailSync;
  return ts ? new Date(ts) : undefined;
}

export function getLastCalendarSync(dataDir: string, slug: string): Date | undefined {
  const ts = readSyncState(dataDir)[slug]?.lastCalendarSync;
  return ts ? new Date(ts) : undefined;
}
