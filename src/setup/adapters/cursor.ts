// src/setup/adapters/cursor.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildCursorRulesMdc } from "../harness-content.js";

const HOME = os.homedir();
const CURSOR_DIR = path.join(HOME, ".cursor");
const CURSOR_GLOBAL_MCP = path.join(CURSOR_DIR, "mcp.json");

export class CursorAdapter implements FrameworkAdapter {
  readonly name = "Cursor";

  detect(): boolean {
    return fs.existsSync(CURSOR_DIR) || fs.existsSync(CURSOR_GLOBAL_MCP);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(CURSOR_GLOBAL_MCP)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8")) as {
        mcpServers?: Record<string, unknown>;
      };
      return !!json?.mcpServers?.["datasynx-opencrm"];
    } catch {
      return false;
    }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(CURSOR_DIR, { recursive: true });
    const harnessFiles: string[] = [];

    // 1. Global MCP config
    let json: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fs.existsSync(CURSOR_GLOBAL_MCP)) {
      try {
        json = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        if (!json.mcpServers) json.mcpServers = {};
      } catch {}
    }
    json.mcpServers!["datasynx-opencrm"] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };
    fs.writeFileSync(CURSOR_GLOBAL_MCP, JSON.stringify(json, null, 2));

    // 2. Project rules in CRM directory (.cursor/rules/datasynx-crm.mdc)
    // MDC format: frontmatter + markdown instructions
    // Cursor reads all .mdc files in .cursor/rules/ as agent context
    const rulesDir = path.join(config.dataDir, ".cursor", "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    const rulesPath = path.join(rulesDir, "datasynx-crm.mdc");
    if (!fs.existsSync(rulesPath)) {
      fs.writeFileSync(rulesPath, buildCursorRulesMdc(config.dataDir));
      harnessFiles.push(rulesPath);
    }

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: CURSOR_GLOBAL_MCP,
      harnessFiles,
      notes:
        "Global MCP registered. CRM rules written to .cursor/rules/. Restart Cursor to activate.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(CURSOR_GLOBAL_MCP)) return;
    try {
      const json = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8")) as {
        mcpServers?: Record<string, unknown>;
      };
      if (json.mcpServers) {
        delete json.mcpServers["datasynx-opencrm"];
      }
      fs.writeFileSync(CURSOR_GLOBAL_MCP, JSON.stringify(json, null, 2));
    } catch {}
  }
}
