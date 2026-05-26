// src/setup/adapters/cline.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";

const HOME = os.homedir();
const CLINE_DIR = path.join(HOME, ".cline");
const CLINE_CONFIG = path.join(CLINE_DIR, "data", "settings", "cline_mcp_settings.json");

export class ClineAdapter implements FrameworkAdapter {
  readonly name = "Cline";

  detect(): boolean {
    return fs.existsSync(CLINE_DIR) || fs.existsSync(CLINE_CONFIG);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(CLINE_CONFIG)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8")) as {
        mcpServers?: Record<string, unknown>;
      };
      return !!json?.mcpServers?.["datasynx-opencrm"];
    } catch {
      return false;
    }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    // Create settings dir if not exists
    fs.mkdirSync(path.dirname(CLINE_CONFIG), { recursive: true });

    let json: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fs.existsSync(CLINE_CONFIG)) {
      try {
        json = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        if (!json.mcpServers) json.mcpServers = {};
      } catch {}
    }

    // Cline requires absolute paths — relative paths fail silently!
    json.mcpServers!["datasynx-opencrm"] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };

    fs.writeFileSync(CLINE_CONFIG, JSON.stringify(json, null, 2));

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: CLINE_CONFIG,
      harnessFiles: [],
      notes: "Cline requires absolute paths. No harness files for VSCode extensions.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(CLINE_CONFIG)) return;
    try {
      const json = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8")) as {
        mcpServers?: Record<string, unknown>;
      };
      if (json.mcpServers) {
        delete json.mcpServers["datasynx-opencrm"];
      }
      fs.writeFileSync(CLINE_CONFIG, JSON.stringify(json, null, 2));
    } catch {}
  }
}
