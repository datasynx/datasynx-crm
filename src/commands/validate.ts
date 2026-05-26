import { Command } from "commander";
import fs from "fs";
import path from "path";
import { MainFactsSchema } from "../schemas/main-facts.js";
import matter from "gray-matter";
import { success, error, warning } from "../ui/colors.js";

export const validateCommand = new Command("validate")
  .option("--fix", "Auto-fix recoverable issues")
  .action(async (_opts: { fix?: boolean }) => {
    const dataDir = process.cwd();
    const customersDir = path.join(dataDir, "customers");

    if (!fs.existsSync(customersDir)) {
      console.log(warning("⚠ No customers directory found."));
      return;
    }

    const slugs = fs
      .readdirSync(customersDir)
      .filter((s) => fs.statSync(path.join(customersDir, s)).isDirectory());

    let errorCount = 0;

    for (const slug of slugs) {
      const factsPath = path.join(customersDir, slug, "main_facts.md");
      const interactionsPath = path.join(customersDir, slug, "interactions.md");

      if (!fs.existsSync(factsPath)) {
        console.log(error(`✗ ${slug}: missing main_facts.md`));
        errorCount++;
        continue;
      }

      try {
        const content = fs.readFileSync(factsPath, "utf-8") as string;
        const { data } = matter(content);
        MainFactsSchema.parse(data);

        if (!fs.existsSync(interactionsPath)) {
          console.log(warning(`⚠ ${slug}: missing interactions.md`));
        } else {
          console.log(success(`✓ ${slug}`));
        }
      } catch (err) {
        console.log(error(`✗ ${slug}: ${(err as Error).message}`));
        errorCount++;
      }
    }

    if (errorCount > 0) {
      console.error(error(`\n${errorCount} error(s) found.`));
      process.exit(1);
    } else {
      console.log(success("\n✓ All customers valid."));
    }
  });
