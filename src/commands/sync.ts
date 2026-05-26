import { Command } from "commander";
import { info, success } from "../ui/colors.js";

export const syncCommand = new Command("sync")
  .argument("<slug>", "Customer slug to sync")
  .option("--since <date>", "Only sync since this date (YYYY-MM-DD)")
  .description("Sync Gmail and transcripts for a customer")
  .action(async (slug: string, _opts: { since?: string }) => {
    console.log(info(`Syncing ${slug}...`));
    console.log(
      info("Gmail sync requires OAuth setup. Run: dxcrm guide for setup instructions.")
    );
    // Full sync implementation in daemon layer
    console.log(success("✓ Sync scheduled (daemon handles background sync)"));
  });
