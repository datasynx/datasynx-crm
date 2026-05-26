// src/daemon/worker.ts
// Standalone detached process — started by `dxcrm daemon start`
// Handles background Gmail sync + transcript watching via cron
import { CronJob } from "cron";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

async function syncAllCustomers(): Promise<void> {
  const customersDir = path.join(DATA_DIR, "customers");
  if (!fs.existsSync(customersDir)) return;

  const slugs = fs.readdirSync(customersDir).filter((s) => {
    try { return fs.statSync(path.join(customersDir, s)).isDirectory(); } catch { return false; }
  });

  for (const slug of slugs) {
    const sourcesPath = path.join(customersDir, slug, "sources.json");
    if (!fs.existsSync(sourcesPath)) continue;

    try {
      const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf-8")) as {
        gmail?: { query?: string; enabled?: boolean };
      };

      if (sources.gmail?.enabled && sources.gmail.query) {
        // Gmail sync requires auth — skip if token not configured
        const tokenPath = path.join(DATA_DIR, ".agentic", "gmail-token.json");
        const credPath = path.join(DATA_DIR, ".agentic", "gmail-credentials.json");
        if (fs.existsSync(tokenPath) && fs.existsSync(credPath)) {
          const { getGmailAuth } = await import("../sync/gmail-auth.js");
          const { syncGmail } = await import("../sync/gmail-sync.js");
          const auth = await getGmailAuth(credPath, tokenPath);
          const result = await syncGmail({
            slug,
            dataDir: DATA_DIR,
            auth,
            query: sources.gmail.query,
            since: new Date(Date.now() - 30 * 60 * 1000), // last 30 min
          });
          if (result.synced > 0) {
            process.stderr.write(`[daemon] ${slug}: synced ${result.synced} emails\n`);
          }
        }
      }
    } catch (err) {
      process.stderr.write(`[daemon] Error syncing ${slug}: ${(err as Error).message}\n`);
    }
  }
}

// Start transcript watcher
async function startWatcher(): Promise<void> {
  const agenticSourcesPath = path.join(DATA_DIR, ".agentic", "sources.json");
  if (!fs.existsSync(agenticSourcesPath)) return;

  try {
    const sources = JSON.parse(fs.readFileSync(agenticSourcesPath, "utf-8")) as {
      transcripts?: { paths?: string[]; extensions?: string[]; enabled?: boolean };
    };

    if (sources.transcripts?.enabled && sources.transcripts.paths?.length) {
      const { watchTranscripts, processTranscriptFile } = await import("../sync/transcript-watcher.js");

      // Find which customer each transcript belongs to (heuristic: first customer)
      const customersDir = path.join(DATA_DIR, "customers");
      const slugs = fs.existsSync(customersDir) ? fs.readdirSync(customersDir) : [];
      const defaultSlug = slugs[0];

      if (defaultSlug) {
        watchTranscripts({
          paths: sources.transcripts.paths,
          extensions: sources.transcripts.extensions ?? [".txt", ".vtt"],
          dataDir: DATA_DIR,
          onFile: (filePath) => processTranscriptFile(filePath, defaultSlug, DATA_DIR),
        });
        process.stderr.write(`[daemon] Watching transcripts for ${defaultSlug}\n`);
      }
    }
  } catch (err) {
    process.stderr.write(`[daemon] Watcher error: ${(err as Error).message}\n`);
  }
}

// Gmail sync every 30 minutes
new CronJob(
  "*/30 * * * *",
  async () => {
    await syncAllCustomers();
  },
  null,
  true,
  undefined,
  null,
  false,
  undefined,
  true // waitForCompletion
);

await startWatcher();

// Signal ready
if (process.send) process.send("ready");
process.stderr.write("[daemon] DatasynxOpenCRM daemon started\n");
