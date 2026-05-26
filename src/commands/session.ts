import { Command } from "commander";
import { setSession, getSession, clearSession } from "../core/session-store.js";
import { readMainFacts, customerExists } from "../fs/customer-dir.js";
import { success, error, info } from "../ui/colors.js";

export const sessionCommand = new Command("session");

sessionCommand
  .command("open <slug>")
  .action(async (slug: string) => {
    const dataDir = process.cwd();
    if (!customerExists(dataDir, slug)) {
      console.error(error(`✗ Customer not found: ${slug}`));
      process.exit(1);
    }
    const facts = await readMainFacts(dataDir, slug);
    setSession({
      customerSlug: slug,
      customerName: facts.name,
      startedAt: new Date().toISOString(),
    });
    console.log(success(`✓ Session opened: ${facts.name}`));
  });

sessionCommand.command("close").action(() => {
  clearSession();
  console.log(success("✓ Session closed."));
});

sessionCommand.command("status").action(() => {
  const s = getSession();
  if (!s) {
    console.log(info("No active session."));
  } else {
    console.log(info(`Active: ${s.customerName} (${s.customerSlug}) since ${s.startedAt}`));
  }
});
