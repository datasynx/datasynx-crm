import { Command } from "commander";
import { info, bold, error } from "../ui/colors.js";
import {
  readUnmatchedConversations,
  clearUnmatchedConversations,
  removeUnmatchedConversation,
} from "../fs/unmatched-conversations.js";

const dataDir = (): string => process.env["DXCRM_DATA_DIR"] ?? process.cwd();

/**
 * `dxcrm conversations resolve <ref> <slug>` — link an unmatched inbound
 * conversation to a customer and drain its queue entry (#75). Mirrors the
 * transcript `resolve`, but also links (the conversation case persists a slug).
 */
export async function runConversationsResolve(ref: string, slug: string): Promise<void> {
  const { getConversation, linkConversationToCustomer } = await import("../core/conversations.js");
  const { listCustomerSlugs } = await import("../fs/customer-dir.js");
  if (!getConversation(dataDir(), ref)) {
    console.error(error(`No conversation '${ref}' — see: dxcrm conversations unmatched`));
    process.exitCode = 1;
    return;
  }
  if (!listCustomerSlugs(dataDir()).includes(slug)) {
    console.error(error(`Unknown customer slug '${slug}'.`));
    process.exitCode = 1;
    return;
  }
  await linkConversationToCustomer(dataDir(), ref, slug);
  removeUnmatchedConversation(dataDir(), ref);
  console.log(info(`Resolved ${ref} → linked to ${slug}, removed from the unmatched queue.`));
}

export const conversationsCommand = new Command("conversations").description(
  "Inbound conversation routing: the unmatched queue (web-chat/WhatsApp that didn't route)"
);

conversationsCommand
  .command("unmatched")
  .description("List inbound conversations that could not be routed to a customer")
  .action(() => {
    const queue = readUnmatchedConversations(dataDir());
    if (queue.length === 0) {
      console.log(info("No unmatched conversations. Every thread landed on a customer. 🎉"));
      return;
    }
    console.log(bold(`${queue.length} unmatched conversation(s):`));
    for (const c of queue) {
      const who = c.contact.email || c.contact.phone || c.contact.name || "anon";
      console.log(`  ${c.id}  ${c.channel}  ${who}  (${c.reason}, ${c.addedAt})`);
    }
    console.log(info("Link one with: dxcrm conversations resolve <id> <slug>"));
  });

conversationsCommand
  .command("resolve <ref> <slug>")
  .description("Link an unmatched conversation to a customer slug and drain the queue entry")
  .action(runConversationsResolve);

conversationsCommand
  .command("clear")
  .description("Clear the unmatched-conversations queue")
  .action(() => {
    clearUnmatchedConversations(dataDir());
    console.log(info("Unmatched-conversations queue cleared."));
  });
