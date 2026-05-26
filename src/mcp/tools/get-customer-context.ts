import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildContext } from "../../core/context-builder.js";
import { getSession } from "../../core/session-store.js";

const DATA_DIR = process.cwd();

export async function handleGetCustomerContext(
  input: { slug?: string },
  dataDir: string = DATA_DIR
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  const targetSlug = input.slug ?? getSession()?.customerSlug;

  if (!targetSlug) {
    return {
      content: [
        {
          type: "text",
          text: "No customer specified and no active session. Use: get_customer_context({ slug: 'acme-corp' })",
        },
      ],
      isError: true,
    };
  }

  try {
    const context = await buildContext(dataDir, targetSlug);
    return {
      content: [{ type: "text", text: context }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

export function registerGetCustomerContext(server: McpServer): void {
  server.registerTool(
    "get_customer_context",
    {
      title: "Get Customer Context",
      description: `Returns a complete, LLM-ready context block for a customer.
Use this before any customer-related conversation or action.

Args:
  slug: Customer ID (e.g. "acme-corp"). Leave empty to use active session customer.

Returns: Structured markdown with Quick Reference, Contacts, Critical Context,
Recent Activity (last 10 interactions), Pipeline, and Open Questions.

Performance: <3 seconds. Token budget: <3000.`,
      inputSchema: z.object({
        slug: z
          .string()
          .optional()
          .describe(
            "Customer slug (e.g. 'acme-corp'). Leave empty for active session customer."
          ),
      }),
    },
    async ({ slug }) =>
      handleGetCustomerContext({ ...(slug !== undefined ? { slug } : {}) })
  );
}
