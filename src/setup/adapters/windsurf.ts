// src/setup/adapters/windsurf.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";

const HOME = os.homedir();
const WINDSURF_DIR = path.join(HOME, ".codeium", "windsurf");
const WINDSURF_CONFIG = path.join(WINDSURF_DIR, "mcp_config.json");

export class WindsurfAdapter implements FrameworkAdapter {
  readonly name = "Windsurf";

  detect(): boolean {
    return fs.existsSync(WINDSURF_DIR) || fs.existsSync(WINDSURF_CONFIG);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(WINDSURF_CONFIG)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8")) as {
        mcpServers?: Record<string, unknown>;
      };
      return !!json?.mcpServers?.["datasynx-opencrm"];
    } catch {
      return false;
    }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    // Create dir if not exists — Windsurf does NOT create this automatically
    fs.mkdirSync(WINDSURF_DIR, { recursive: true });

    let json: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fs.existsSync(WINDSURF_CONFIG)) {
      try {
        json = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        if (!json.mcpServers) json.mcpServers = {};
      } catch {}
    }

    // Windsurf supports ${env:VAR} interpolation — we use absolute path for reliability
    json.mcpServers!["datasynx-opencrm"] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };

    fs.writeFileSync(WINDSURF_CONFIG, JSON.stringify(json, null, 2));

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: WINDSURF_CONFIG,
      harnessFiles: [],
      notes: "No harness files for IDE-based tools. Restart Windsurf to activate.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(WINDSURF_CONFIG)) return;
    try {
      const json = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8")) as {
        mcpServers?: Record<string, unknown>;
      };
      if (json.mcpServers) {
        delete json.mcpServers["datasynx-opencrm"];
      }
      fs.writeFileSync(WINDSURF_CONFIG, JSON.stringify(json, null, 2));
    } catch {}
  }
}
