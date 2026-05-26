// src/sync/transcript-watcher.ts
// chokidar v4 — NO glob support in watch(), use ignored as a function
import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

interface WatchOptions {
  paths: string[];
  extensions: string[];
  dataDir: string;
  onFile: (filePath: string) => Promise<void>;
}

export function watchTranscripts(opts: WatchOptions): FSWatcher {
  const { paths, extensions, onFile } = opts;

  const watcher = chokidar.watch(paths, {
    // v4: ignored is a function (no glob strings)
    ignored: (p: string, stats?: fs.Stats) => {
      if (stats?.isDirectory()) return false;
      return !extensions.some((ext) => p.endsWith(ext));
    },
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
    ignoreInitial: false,
    persistent: true,
  });

  watcher.on("add", (filePath) => {
    onFile(filePath).catch((err: unknown) => {
      console.error(`[transcript-watcher] Error processing ${filePath}:`, (err as Error).message);
    });
  });

  return watcher;
}

export async function processTranscriptFile(
  filePath: string,
  slug: string,
  dataDir: string
): Promise<void> {
  const source = `file://${filePath}`;

  const { readInteractions, appendInteraction } = await import("../fs/interactions-writer.js");
  const existing = await readInteractions(dataDir, slug);
  if (existing.includes(source)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const date = new Date().toISOString().slice(0, 10);
  const filename = filePath.split("/").pop() ?? filePath;

  await appendInteraction(dataDir, slug, {
    date,
    type: "Meeting",
    with: filename,
    subject: filename,
    summary: content.slice(0, 500) + (content.length > 500 ? "..." : ""),
    nextSteps: [],
    sourceRef: source,
    synced: new Date().toISOString(),
  });

  const { indexInLanceDB } = await import("../core/lancedb.js");
  await indexInLanceDB(dataDir, slug, content.slice(0, 2000), source, {
    date,
    type: "Meeting",
  }).catch((err: unknown) => {
    process.stderr.write(`[transcript-watcher] LanceDB index failed: ${(err as Error).message}\n`);
  });
}

function readCustomerName(customersDir: string, slug: string): string {
  const mainFactsPath = path.join(customersDir, slug, "main_facts.md");
  if (!fs.existsSync(mainFactsPath)) return slug;
  try {
    const raw = matter(fs.readFileSync(mainFactsPath, "utf-8"));
    return typeof raw.data["name"] === "string" ? raw.data["name"] : slug;
  } catch {
    return slug;
  }
}

export async function processTranscriptFileAutoMatch(
  filePath: string,
  dataDir: string
): Promise<void> {
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) {
    await recordUnmatched(dataDir, filePath, "no_customers_defined");
    return;
  }

  const slugs = fs.readdirSync(customersDir).filter((s) => {
    try { return fs.statSync(path.join(customersDir, s)).isDirectory(); } catch { return false; }
  });

  if (slugs.length === 0) {
    await recordUnmatched(dataDir, filePath, "no_customers_defined");
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const candidates = slugs.map((slug) => ({
    slug,
    name: readCustomerName(customersDir, slug),
  }));

  const { recognizeCustomer } = await import("../core/llm.js");
  const match = await recognizeCustomer(content, candidates);

  if (match.slug && match.confidence !== "low") {
    await processTranscriptFile(filePath, match.slug, dataDir);
  } else {
    await recordUnmatched(dataDir, filePath, "no_customer_match");
  }
}

async function recordUnmatched(
  dataDir: string,
  filePath: string,
  reason: "no_customer_match" | "no_customers_defined"
): Promise<void> {
  const { appendUnmatched } = await import("../fs/unmatched-transcripts.js");
  appendUnmatched(dataDir, { filePath, addedAt: new Date().toISOString(), reason });
  process.stderr.write(`[transcript-watcher] Unmatched: ${filePath} (${reason})\n`);
}
