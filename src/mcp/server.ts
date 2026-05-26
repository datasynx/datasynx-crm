import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGetCapabilities } from "./tools/get-capabilities.js";
import { registerGetActiveSession } from "./tools/get-active-session.js";
import { registerGetCustomerContext } from "./tools/get-customer-context.js";
import { registerSearchCustomerKnowledge } from "./tools/search-customer-knowledge.js";
import { registerListCustomers } from "./tools/list-customers.js";
import { registerLogInteraction } from "./tools/log-interaction.js";
import { registerUpdateDeal } from "./tools/update-deal.js";
import { registerExportCustomer } from "./tools/export-customer.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "datasynx-opencrm",
    version: "0.1.0",
  });

  // Register all 8 tools
  // IMPORTANT: Use server.registerTool() — server.tool() is deprecated in v2
  registerGetCapabilities(server);
  registerGetActiveSession(server);
  registerGetCustomerContext(server);
  registerSearchCustomerKnowledge(server);
  registerListCustomers(server);
  registerLogInteraction(server);
  registerUpdateDeal(server);
  registerExportCustomer(server);

  return server;
}

export async function startStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // IMPORTANT: console.log would corrupt the MCP stdio protocol — always use console.error
  console.error("DatasynxOpenCRM MCP Server running via stdio");
}

// Entry point when run directly (e.g. node dist/mcp.js)
startStdio().catch((err: unknown) => {
  console.error("MCP Server fatal error:", (err as Error).message);
  process.exit(1);
});
