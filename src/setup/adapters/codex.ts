// src/setup/adapters/codex.ts
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildAgentsMd } from "../harness-content.js";

const CODEX_DIR = path.join(os.homedir(), ".codex");
const CODEX_CONFIG = path.join(CODEX_DIR, "config.toml");

export class CodexAdapter implements FrameworkAdapter {
  readonly name = "Codex";

  detect(): boolean {
    try {
      execSync("which codex", { stdio: "ignore" });
      return true;
    } catch {}
    return fs.existsSync(CODEX_DIR);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(CODEX_CONFIG)) return false;
    return fs.readFileSync(CODEX_CONFIG, "utf-8").includes("[mcp_servers.datasynx-opencrm]");
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(CODEX_DIR, { recursive: true });
    const harnessFiles: string[] = [];

    // Idempotency check
    if (!this.isInstalled()) {
      const block = [
        ``,
        `[mcp_servers.${config.serverName}]`,
        `command = ${JSON.stringify(process.execPath)}`,
        `args = [${JSON.stringify(config.mcpServerPath)}]`,
        `env = { DXCRM_DATA_DIR = ${JSON.stringify(config.dataDir)} }`,
        `startup_timeout_sec = 30`,
        `tool_timeout_sec = 120`,
        `enabled = true`,
        ``,
      ].join("\n");

      fs.appendFileSync(CODEX_CONFIG, block, "utf-8");
    }

    // Write AGENTS.md to dataDir if not already present with CRM content
    const agentsPath = path.join(config.dataDir, "AGENTS.md");
    if (!fs.existsSync(agentsPath)) {
      fs.writeFileSync(agentsPath, buildAgentsMd(config.dataDir));
      harnessFiles.push(agentsPath);
    } else {
      const existing = fs.readFileSync(agentsPath, "utf-8");
      if (!existing.includes("DatasynxOpenCRM")) {
        fs.appendFileSync(agentsPath, "\n\n---\n\n" + buildAgentsMd(config.dataDir));
        harnessFiles.push(agentsPath + " (appended)");
      }
    }

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: CODEX_CONFIG,
      harnessFiles,
      notes: `startup_timeout_sec=30, tool_timeout_sec=120. AGENTS.md written to CRM root.`,
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(CODEX_CONFIG)) return;
    const content = fs.readFileSync(CODEX_CONFIG, "utf-8");
    // Remove the [mcp_servers.datasynx-opencrm] block
    const cleaned = content.replace(/\n?\[mcp_servers\.datasynx-opencrm\][^\[]*/, "");
    fs.writeFileSync(CODEX_CONFIG, cleaned);
  }
}
