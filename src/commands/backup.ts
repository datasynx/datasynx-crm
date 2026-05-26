import { Command } from "commander";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { success, error } from "../ui/colors.js";

export const backupCommand = new Command("backup")
  .argument("[output]", "Output path for backup zip")
  .description("Backup customers/ directory")
  .action(async (output?: string) => {
    const dataDir = process.cwd();
    const customersDir = path.join(dataDir, "customers");

    if (!fs.existsSync(customersDir)) {
      console.error(error("✗ No customers directory found."));
      process.exit(1);
    }

    const zipPath =
      output ??
      path.join(dataDir, `dxcrm-backup-${new Date().toISOString().slice(0, 10)}.zip`);

    try {
      execSync(`zip -r "${zipPath}" customers/`, { cwd: dataDir });
      console.log(success(`✓ Backup saved: ${zipPath}`));
    } catch (err) {
      console.error(error(`✗ Backup failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

export const restoreCommand = new Command("restore")
  .argument("<path>", "Path to backup zip")
  .description("Restore from backup zip")
  .action(async (zipPath: string) => {
    const dataDir = process.cwd();
    try {
      execSync(`unzip -o "${path.resolve(zipPath)}" -d "${dataDir}"`, { cwd: dataDir });
      console.log(success("✓ Restore complete."));
    } catch (err) {
      console.error(error(`✗ Restore failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });
