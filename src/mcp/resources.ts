import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listCustomerSlugs } from "../fs/customer-dir.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

/**
 * Read-only MCP Resources for CRM entities. Complements the action Tools:
 * agents can `resources/read` a customer briefing, pipeline or timeline by URI
 * instead of calling a tool.
 */
export function registerResources(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerResource(
    "customers",
    "crm://customers",
    {
      title: "Customers",
      description: "List of all customer slugs",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(listCustomerSlugs(dataDir), null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "customer",
    new ResourceTemplate("crm://customer/{slug}", { list: undefined }),
    {
      title: "Customer context",
      description: "LLM-ready briefing (main facts, recent interactions, pipeline) for a customer",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const { buildContext } = await import("../core/context-builder.js");
      const text = await buildContext(dataDir, String(variables["slug"]));
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    }
  );

  server.registerResource(
    "pipeline",
    new ResourceTemplate("crm://pipeline/{slug}", { list: undefined }),
    {
      title: "Pipeline",
      description: "Open and closed deals for a customer",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const { readPipeline } = await import("../fs/pipeline-writer.js");
      const deals = await readPipeline(dataDir, String(variables["slug"]));
      return {
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(deals, null, 2) },
        ],
      };
    }
  );

  server.registerResource(
    "timeline",
    new ResourceTemplate("crm://timeline/{slug}", { list: undefined }),
    {
      title: "Interaction timeline",
      description: "Newest-first interaction history for a customer",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const { readInteractions } = await import("../fs/interactions-writer.js");
      const text = await readInteractions(dataDir, String(variables["slug"]));
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    }
  );
}
