import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { signDashboardToken } from "../../core/dashboard.js";
import { getActor } from "../../fs/audit-log.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleGetDashboardLink(
  input: { validDays?: number },
  _dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const days = input.validDays ?? 7;
  const actor = getActor();
  const token = signDashboardToken({ a: actor, exp: Date.now() + days * 86_400_000 });
  const base = (process.env["DXCRM_SERVER_URL"] ?? "http://localhost:3847").replace(/\/+$/, "");
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { link: `${base}/dashboard?token=${token}`, actor, expiresInDays: days },
          null,
          2
        ),
      },
    ],
  };
}

export function registerGetDashboardLink(server: McpServer): void {
  server.registerTool(
    "get_dashboard_link",
    {
      title: "Get Dashboard Link",
      description: `Mint a token-secured link to the read-only web dashboard (#52): forecast
(P50/P90, rolling 90d), funnel, velocity, goals and top risks — server-rendered
from local snapshots, no external cloud. RBAC-aware: the link is bound to the
current actor (a rep sees only their own forecast; global tiles are
manager/admin only). Tokens are HMAC-signed and expire.

Returns: { link, actor, expiresInDays }`,
      inputSchema: z.object({
        validDays: z.number().int().positive().optional().describe("Link validity (default 7)"),
      }),
    },
    async ({ validDays }) => handleGetDashboardLink(validDays !== undefined ? { validDays } : {})
  );
}
