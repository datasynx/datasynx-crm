import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CAPABILITIES_TEXT } from "../capabilities.js";

export async function handleGetCapabilities(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  return {
    content: [{ type: "text", text: CAPABILITIES_TEXT }],
  };
}

export function registerGetCapabilities(server: McpServer): void {
  server.registerTool(
    "get_capabilities",
    {
      title: "Get Capabilities",
      description:
        "Returns all available MCP tools, their inputs, and the CRM workflow guide. " +
        "Call this first to understand what DatasynxOpenCRM can do.",
      inputSchema: z.object({}),
    },
    async () => handleGetCapabilities()
  );
}
