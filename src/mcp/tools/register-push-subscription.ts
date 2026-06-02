import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { register, type PushProvider } from "../../sync/push-manager.js";
import { enforceRbac } from "../../core/rbac.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

const VALID_PROVIDERS: PushProvider[] = ["gmail", "microsoft-graph", "slack"];

export async function handleRegisterPushSubscription(
  input: {
    provider: PushProvider;
    slug: string;
    webhookUrl: string;
    gmailTopicName?: string;
    microsoftClientState?: string;
    microsoftResource?: string;
    slackTeamId?: string;
    slackChannelId?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    if (!VALID_PROVIDERS.includes(input.provider)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: `Unknown provider: ${input.provider}` },
              null,
              2
            ),
          },
        ],
      };
    }

    enforceRbac(dataDir, "register_push_subscription");

    const providerData: Record<string, string> = {};
    if (input.gmailTopicName) providerData["gmailTopicName"] = input.gmailTopicName;
    if (input.microsoftClientState)
      providerData["microsoftClientState"] = input.microsoftClientState;
    if (input.microsoftResource) providerData["microsoftResource"] = input.microsoftResource;
    if (input.slackTeamId) providerData["slackTeamId"] = input.slackTeamId;
    if (input.slackChannelId) providerData["slackChannelId"] = input.slackChannelId;

    const sub = await register(dataDir, input.provider, input.slug, {
      webhookUrl: input.webhookUrl,
      providerData,
    });

    const warning = input.webhookUrl.includes("localhost")
      ? "Warning: webhookUrl contains 'localhost' — providers cannot reach local endpoints. Use a tunnel (e.g. ngrok http 3847) for development."
      : undefined;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              subscriptionId: sub.id,
              provider: sub.provider,
              slug: sub.slug,
              status: sub.status,
              expiresAt: sub.expiresAt,
              createdAt: sub.createdAt,
              ...(warning ? { warning } : {}),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
        },
      ],
    };
  }
}

export function registerRegisterPushSubscription(server: McpServer): void {
  server.registerTool(
    "register_push_subscription",
    {
      title: "Register Push Subscription",
      description: `Register a real-time push subscription for a customer (Gmail Pub/Sub, MS Graph webhook, or Slack Events).

Instead of polling every 30 minutes, the provider will push new events to dxcrm within seconds.

RBAC: admin only

Args:
  provider: "gmail" | "microsoft-graph" | "slack"
  slug: Customer slug to receive events for
  webhookUrl: Public HTTPS URL where the provider will POST events (e.g. https://yourserver.com/webhooks/gmail)
  gmailTopicName: (Gmail only) Cloud Pub/Sub topic name (e.g. projects/my-project/topics/gmail-push)
  microsoftClientState: (MS Graph only) Secret for HMAC verification
  microsoftResource: (MS Graph only) Resource path (e.g. /me/mailFolders/Inbox/messages)
  slackTeamId: (Slack only) Workspace/team ID (e.g. T12345)
  slackChannelId: (Slack only) Optional specific channel to monitor

Returns: { subscriptionId, provider, slug, status, expiresAt, createdAt, warning? }`,
      inputSchema: z.object({
        provider: z.enum(["gmail", "microsoft-graph", "slack"]).describe("Push provider"),
        slug: z.string().describe("Customer slug"),
        webhookUrl: z.string().describe("Public HTTPS URL for provider callbacks"),
        gmailTopicName: z.string().optional().describe("Gmail: Cloud Pub/Sub topic name"),
        microsoftClientState: z.string().optional().describe("MS Graph: secret for verification"),
        microsoftResource: z.string().optional().describe("MS Graph: resource path"),
        slackTeamId: z.string().optional().describe("Slack: workspace team ID"),
        slackChannelId: z.string().optional().describe("Slack: optional channel ID"),
      }),
    },
    async ({
      provider,
      slug,
      webhookUrl,
      gmailTopicName,
      microsoftClientState,
      microsoftResource,
      slackTeamId,
      slackChannelId,
    }) =>
      handleRegisterPushSubscription(
        {
          provider,
          slug,
          webhookUrl,
          ...(gmailTopicName !== undefined ? { gmailTopicName } : {}),
          ...(microsoftClientState !== undefined ? { microsoftClientState } : {}),
          ...(microsoftResource !== undefined ? { microsoftResource } : {}),
          ...(slackTeamId !== undefined ? { slackTeamId } : {}),
          ...(slackChannelId !== undefined ? { slackChannelId } : {}),
        },
        DATA_DIR
      )
  );
}
