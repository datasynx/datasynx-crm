import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { aggregateEngagement } from "../../fs/sent-store.js";
import { trackingMode } from "../../core/email-tracking.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleGetEmailEngagement(
  input: { slug: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const contacts = aggregateEngagement(dataDir, input.slug);
    const totals = contacts.reduce(
      (acc, c) => {
        acc.sent += c.sent;
        acc.opens += c.opens;
        acc.clicks += c.clicks;
        acc.replies += c.replies;
        return acc;
      },
      { sent: 0, opens: 0, clicks: 0, replies: 0 }
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { slug: input.slug, trackingMode: trackingMode(), totals, contacts },
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

export function registerGetEmailEngagement(server: McpServer): void {
  server.registerTool(
    "get_email_engagement",
    {
      title: "Get Email Engagement",
      description: `Outbound email engagement per contact (#45): sent / opens / clicks / replies,
last open, and average reply latency. Reply tracking works without a pixel
(thread correlation); opens/clicks require DXCRM_EMAIL_TRACKING=opens|clicks|all.
The strongest timing signal in sales — "the contact is warm, follow up now."

Returns: { slug, trackingMode, totals, contacts: [{ contactEmail, sent, opens, clicks, replies, lastOpenAt?, lastReplyAt?, avgReplyLatencyHours? }] }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
      }),
    },
    async ({ slug }) => handleGetEmailEngagement({ slug })
  );
}
