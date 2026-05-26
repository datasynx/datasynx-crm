import fs from "fs";
import path from "path";

export interface UnmatchedTranscript {
  filePath: string;
  addedAt: string; // ISO timestamp
  reason: "no_customer_match" | "no_customers_defined";
}

function getUnmatchedPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "unmatched-transcripts.json");
}

export function readUnmatched(dataDir: string): UnmatchedTranscript[] {
  const filePath = getUnmatchedPath(dataDir);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8") as string) as UnmatchedTranscript[];
  } catch {
    return [];
  }
}

export function appendUnmatched(dataDir: string, entry: UnmatchedTranscript): void {
  const filePath = getUnmatchedPath(dataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existing = readUnmatched(dataDir);
  existing.push(entry);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf-8");
}

export function clearUnmatched(dataDir: string): void {
  const filePath = getUnmatchedPath(dataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "[]", "utf-8");
}
