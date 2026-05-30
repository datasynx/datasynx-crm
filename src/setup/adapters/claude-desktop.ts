// src/setup/adapters/claude-desktop.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";

// Platform-specific config paths (as of May 2026):
// macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
// Windows: %APPDATA%\Claude\claude_desktop_config.json
// Linux:   ~/.config/claude-desktop/claude_desktop_config.json
function getDesktopConfigPath(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      );
    case "win32":
      return path.join(
        process.env["APPDATA"] ?? os.homedir(),
        "Claude",
        "claude_desktop_config.json"
      );
    default: // linux
      return path.join(os.homedir(), ".config", "claude-desktop", "claude_desktop_config.json");
  }
}

const DESKTOP_CONFIG = getDesktopConfigPath();

export class ClaudeDesktopAdapter implements FrameworkAdapter {
  readonly name = "Claude Desktop";

  detect(): boolean {
    return fs.existsSync(DESKTOP_CONFIG) || fs.existsSync(path.dirname(DESKTOP_CONFIG));
  }

  isInstalled(): boolean {
    if (!fs.existsSync(DESKTOP_CONFIG)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8")) as Record<string, unknown>;
      const servers = json["mcpServers"] as Record<string, unknown> | undefined;
      return !!servers?.["datasynx-opencrm"];
    } catch {
      return false;
    }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    // Create dir if not exists (may not exist until app is first launched)
    fs.mkdirSync(path.dirname(DESKTOP_CONFIG), { recursive: true });

    let json: Record<string, unknown> = {};
    if (fs.existsSync(DESKTOP_CONFIG)) {
      try {
        json = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8")) as Record<string, unknown>;
      } catch {}
    }
    if (!json["mcpServers"]) json["mcpServers"] = {};
    (json["mcpServers"] as Record<string, unknown>)[config.serverName] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };
    fs.writeFileSync(DESKTOP_CONFIG, JSON.stringify(json, null, 2));

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: DESKTOP_CONFIG,
      harnessFiles: [],
      notes: "Restart Claude Desktop to activate the MCP server. No harness files for Desktop app.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(DESKTOP_CONFIG)) return;
    try {
      const json = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8")) as Record<string, unknown>;
      const servers = json["mcpServers"] as Record<string, unknown> | undefined;
      if (servers) {
        delete servers["datasynx-opencrm"];
      }
      fs.writeFileSync(DESKTOP_CONFIG, JSON.stringify(json, null, 2));
    } catch {}
  }
}
