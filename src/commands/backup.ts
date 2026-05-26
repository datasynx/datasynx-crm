import { Command } from "commander";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { success, error, info, bold } from "../ui/colors.js";

export interface BackupScheduleConfig {
  every: string;
  keep: number;
  lastBackup: string | null;
}

export interface AgenticConfig {
  backupSchedule?: BackupScheduleConfig;
}

function getConfigPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "config.json");
}

function readAgenticConfig(dataDir: string): AgenticConfig {
  const filePath = getConfigPath(dataDir);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8") as string) as AgenticConfig;
  } catch {
    return {};
  }
}

function writeAgenticConfig(dataDir: string, config: AgenticConfig): void {
  const filePath = getConfigPath(dataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

export async function runBackupSchedule(
  opts: { every?: string; keep?: string; status?: boolean; clear?: boolean },
  dataDir?: string
): Promise<void> {
  const dir = dataDir ?? process.cwd();

  if (opts.clear) {
    const config = readAgenticConfig(dir);
    delete config.backupSchedule;
    writeAgenticConfig(dir, config);
    console.log(success("✓ Backup schedule cleared."));
    return;
  }

  if (opts.status) {
    const config = readAgenticConfig(dir);
    const sched = config.backupSchedule;
    if (!sched) {
      console.log(info("No backup schedule configured."));
    } else {
      console.log(bold("Backup Schedule:"));
      console.log(`  every:      ${sched.every}`);
      console.log(`  keep:       ${sched.keep} backups`);
      console.log(`  lastBackup: ${sched.lastBackup ?? "never"}`);
    }
    return;
  }

  if (!opts.every) {
    console.error(error("✗ --every is required (e.g. --every day)"));
    process.exit(1);
    return;
  }

  const keep = opts.keep ? parseInt(opts.keep, 10) : 7;
  const config = readAgenticConfig(dir);
  config.backupSchedule = {
    every: opts.every,
    keep,
    lastBackup: null,
  };
  writeAgenticConfig(dir, config);
  console.log(success(`✓ Backup schedule set: every ${opts.every}, keep ${keep}.`));
}

export function shouldRunScheduledBackup(dataDir: string): boolean {
  const config = readAgenticConfig(dataDir);
  const sched = config.backupSchedule;
  if (!sched) return false;
  if (!sched.lastBackup) return true;
  const last = new Date(sched.lastBackup).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Date.now() - last >= oneDayMs;
}

export function pruneOldBackups(dir: string, keep: number): void {
  const files = fs.readdirSync(dir)
    .filter((f) => f.match(/^dxcrm-backup-\d{4}-\d{2}-\d{2}.*\.zip$/))
    .sort();
  const toDelete = files.slice(0, Math.max(0, files.length - keep));
  for (const f of toDelete) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      // ignore
    }
  }
}

export async function runScheduledBackupIfDue(dataDir: string): Promise<void> {
  if (!shouldRunScheduledBackup(dataDir)) return;
  const config = readAgenticConfig(dataDir);
  const sched = config.backupSchedule!;
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) return;
  const zipPath = path.join(
    dataDir,
    `dxcrm-backup-${new Date().toISOString().slice(0, 10)}.zip`
  );
  try {
    execSync(`zip -r "${zipPath}" customers/`, { cwd: dataDir });
    pruneOldBackups(dataDir, sched.keep);
    config.backupSchedule!.lastBackup = new Date().toISOString();
    writeAgenticConfig(dataDir, config);
    process.stderr.write(`[daemon] Scheduled backup saved: ${zipPath}\n`);
  } catch (err) {
    process.stderr.write(`[daemon] Scheduled backup failed: ${(err as Error).message}\n`);
  }
}

export async function runBackup(output?: string, dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const customersDir = path.join(dir, "customers");

  if (!fs.existsSync(customersDir)) {
    console.error(error("✗ No customers directory found."));
    process.exit(1);
  }

  const zipPath =
    output ??
    path.join(dir, `dxcrm-backup-${new Date().toISOString().slice(0, 10)}.zip`);

  try {
    execSync(`zip -r "${zipPath}" customers/`, { cwd: dir });
    console.log(success(`✓ Backup saved: ${zipPath}`));
  } catch (err) {
    console.error(error(`✗ Backup failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

export async function runRestore(zipPath: string, dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  try {
    execSync(`unzip -o "${path.resolve(zipPath)}" -d "${dir}"`, { cwd: dir });
    console.log(success("✓ Restore complete."));
  } catch (err) {
    console.error(error(`✗ Restore failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

const scheduleSubCommand = new Command("schedule")
  .description("Configure automatic backup schedule")
  .option("--every <interval>", "Backup interval (e.g. day)")
  .option("--keep <n>", "Number of backups to keep (default: 7)")
  .option("--status", "Show current schedule")
  .option("--clear", "Remove backup schedule")
  .action((opts) => runBackupSchedule(opts));

export const backupCommand = new Command("backup")
  .argument("[output]", "Output path for backup zip")
  .description("Backup customers/ directory")
  .action((output?: string) => runBackup(output));

backupCommand.addCommand(scheduleSubCommand);

export const restoreCommand = new Command("restore")
  .argument("<path>", "Path to backup zip")
  .description("Restore from backup zip")
  .action((zipPath: string) => runRestore(zipPath));
