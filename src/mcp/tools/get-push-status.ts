import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSubscriptions, type PushProvider, type PushStatus } from "../../sync/push-manager.js";

const DATA_DIR = process.cwd();

export async function handleGetPushStatus(
  input: { slug?: string; provider?: PushProvider },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    let subs = await readSubscriptions(dataDir);

    if (input.slug) subs = subs.filter((s) => s.slug === input.slug);
    if (input.provider) subs = subs.filter((s) => s.provider === input.provider);

    const now = Date.now();
    const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

    const subscriptions = subs.map((s) => {
      const expiresInHours = s.expiresAt
        ? Math.round((new Date(s.expiresAt).getTime() - now) / (60 * 60 * 1000))
        : null;
      const needsRenewal =
        s.expiresAt !== null && new Date(s.expiresAt).getTime() - now < RENEWAL_THRESHOLD_MS;

      return {
        id: s.id,
        provider: s.provider,
        slug: s.slug,
        status: s.status,
        expiresAt: s.expiresAt,
        expiresInHours,
        needsRenewal,
        lastEventAt: s.lastEventAt,
        eventsProcessed: s.eventsProcessed,
        webhookUrl: s.webhookUrl,
      };
    });

    const countByStatus = (status: PushStatus) => subs.filter((s) => s.status === status).length;

    const summary = {
      total: subs.length,
      active: countByStatus("active"),
      expiringSoon: subscriptions.filter((s) => s.needsRenewal && s.status === "active").length,
      expired: countByStatus("expired"),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ subscriptions, summary }, null, 2),
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

export function registerGetPushStatus(server: McpServer): void {
  server.registerTool(
    "get_push_status",
    {
      title: "Get Push Status",
      description: `Get the status of all active push subscriptions (Gmail Pub/Sub, MS Graph, Slack Events).

Shows which customers have real-time push enabled, when subscriptions expire, and how many events have been processed.

RBAC: any

Args:
  slug: (optional) Filter by customer slug
  provider: (optional) Filter by provider — "gmail" | "microsoft-graph" | "slack"

Returns: { subscriptions: [{ id, provider, slug, status, expiresAt, expiresInHours, needsRenewal, lastEventAt, eventsProcessed }], summary: { total, active, expiringSoon, expired } }`,
      inputSchema: z.object({
        slug: z.string().optional().describe("Filter by customer slug"),
        provider: z
          .enum(["gmail", "microsoft-graph", "slack"])
          .optional()
          .describe("Filter by provider"),
      }),
    },
    async ({ slug, provider }) =>
      handleGetPushStatus(
        {
          ...(slug !== undefined ? { slug } : {}),
          ...(provider !== undefined ? { provider } : {}),
        },
        DATA_DIR
      )
  );
}
