import { Command } from "commander";
import { register, readSubscriptions, revoke, renewExpiringSubscriptions } from "../sync/push-manager.js";
import type { PushProvider } from "../sync/push-manager.js";
import { success, error, info, bold } from "../ui/colors.js";

export async function runPushRegister(
  slug: string,
  options: {
    provider: PushProvider;
    webhookUrl: string;
    topicName?: string;
    clientState?: string;
    resource?: string;
    teamId?: string;
    channelId?: string;
  }
): Promise<void> {
  const dataDir = process.cwd();
  const providerData: Record<string, string> = {};
  if (options.topicName) providerData["gmailTopicName"] = options.topicName;
  if (options.clientState) providerData["microsoftClientState"] = options.clientState;
  if (options.resource) providerData["microsoftResource"] = options.resource;
  if (options.teamId) providerData["slackTeamId"] = options.teamId;
  if (options.channelId) providerData["slackChannelId"] = options.channelId;

  const sub = await register(dataDir, options.provider, slug, {
    webhookUrl: options.webhookUrl,
    providerData,
  });

  console.log(success(`✓ Push subscription registered: ${bold(sub.id)}`));
  console.log(info(`  Provider  : ${sub.provider}`));
  console.log(info(`  Slug      : ${sub.slug}`));
  console.log(info(`  Webhook   : ${sub.webhookUrl}`));
  console.log(info(`  Expires   : ${sub.expiresAt ?? "never"}`));

  if (options.webhookUrl.includes("localhost")) {
    console.log(info(`  ⚠ Warning: localhost URLs cannot be reached by external providers.`));
    console.log(info(`            Use a tunnel: ngrok http 3847`));
  }
}

export async function runPushStatus(options: { slug?: string; provider?: string }): Promise<void> {
  const dataDir = process.cwd();
  let subs = await readSubscriptions(dataDir);

  if (options.slug) subs = subs.filter((s) => s.slug === options.slug);
  if (options.provider) subs = subs.filter((s) => s.provider === options.provider);

  if (subs.length === 0) {
    console.log(info("No push subscriptions registered. Use `dxcrm push register` to add one."));
    return;
  }

  const now = Date.now();
  console.log(bold(`\n Push Subscriptions (${subs.length})\n`));
  for (const s of subs) {
    const expiresIn = s.expiresAt
      ? Math.round((new Date(s.expiresAt).getTime() - now) / (60 * 60 * 1000))
      : null;
    const expiryStr = expiresIn !== null ? `${expiresIn}h remaining` : "no expiry";
    const needsRenewal = s.expiresAt !== null && (new Date(s.expiresAt).getTime() - now) < 24 * 60 * 60 * 1000;

    console.log(bold(`  ${s.id}`));
    console.log(info(`  ${s.provider} → ${s.slug} [${s.status}]`));
    console.log(info(`  Events: ${s.eventsProcessed}  |  Expires: ${expiryStr}${needsRenewal ? " ⚠ RENEW SOON" : ""}`));
    console.log(info(`  Last event: ${s.lastEventAt ?? "—"}`));
    console.log("");
  }
}

export async function runPushRevoke(id: string): Promise<void> {
  const dataDir = process.cwd();
  try {
    await revoke(dataDir, id);
    console.log(success(`✓ Subscription ${bold(id)} revoked`));
  } catch (err_) {
    console.error(error(`✗ Subscription not found: ${id}`));
    process.exit(1);
  }
}

export async function runPushRenew(options: { all?: boolean; id?: string }): Promise<void> {
  const dataDir = process.cwd();
  if (options.id) {
    const subs = await readSubscriptions(dataDir);
    const sub = subs.find((s) => s.id === options.id);
    if (!sub) {
      console.error(error(`✗ Subscription not found: ${options.id}`));
      process.exit(1);
    }
    console.log(info(`  Renewal for ${sub.id} requires provider-specific logic.`));
    console.log(info(`  Use the daemon's automatic renewal (daily 06:00) or re-register.`));
    return;
  }
  const result = await renewExpiringSubscriptions(dataDir, async () => {
    throw new Error("No default renew function — use provider-specific tooling");
  }, 24);
  console.log(info(`  Renewed: ${result.renewed.length}  |  Errors: ${result.errors.length}`));
  if (result.renewed.length > 0) console.log(success(`✓ Renewed: ${result.renewed.join(", ")}`));
  if (result.errors.length > 0) console.log(error(`✗ Errors: ${result.errors.join(", ")}`));
}

export const pushCommand = new Command("push")
  .description("Manage real-time push subscriptions (Gmail Pub/Sub, MS Graph, Slack Events)");

pushCommand
  .command("register <slug>")
  .description("Register a push subscription for a customer")
  .requiredOption("--provider <provider>", "Provider: gmail | microsoft-graph | slack")
  .requiredOption("--webhook-url <url>", "Public HTTPS URL for provider callbacks")
  .option("--topic-name <topic>", "Gmail: Cloud Pub/Sub topic name")
  .option("--client-state <secret>", "MS Graph: client state secret")
  .option("--resource <path>", "MS Graph: resource path")
  .option("--team-id <id>", "Slack: workspace team ID")
  .option("--channel-id <id>", "Slack: optional channel ID")
  .action(async (slug: string, opts: {
    provider: PushProvider;
    webhookUrl: string;
    topicName?: string;
    clientState?: string;
    resource?: string;
    teamId?: string;
    channelId?: string;
  }) => {
    await runPushRegister(slug, opts);
  });

pushCommand
  .command("status")
  .description("Show all push subscriptions")
  .option("--slug <slug>", "Filter by customer slug")
  .option("--provider <provider>", "Filter by provider")
  .action(async (opts: { slug?: string; provider?: string }) => {
    await runPushStatus(opts);
  });

pushCommand
  .command("revoke <id>")
  .description("Revoke a push subscription by ID")
  .action(async (id: string) => {
    await runPushRevoke(id);
  });

pushCommand
  .command("renew")
  .description("Renew expiring push subscriptions")
  .option("--all", "Renew all expiring subscriptions")
  .option("--id <id>", "Renew a specific subscription by ID")
  .action(async (opts: { all?: boolean; id?: string }) => {
    await runPushRenew(opts);
  });
