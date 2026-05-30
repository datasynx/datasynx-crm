// src/setup/adapters/openclaw.ts
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildSoulMd, buildAgentsMd } from "../harness-content.js";

const HOME = os.homedir();
const OPENCLAW_DIR = path.join(HOME, ".openclaw");
const OPENCLAW_JSON = path.join(OPENCLAW_DIR, "openclaw.json");
const OPENCLAW_WORKSPACE = path.join(OPENCLAW_DIR, "workspace");

export class OpenClawAdapter implements FrameworkAdapter {
  readonly name = "OpenClaw";

  detect(): boolean {
    try {
      execSync("which openclaw", { stdio: "ignore" });
      return true;
    } catch {}
    return fs.existsSync(OPENCLAW_DIR) || fs.existsSync(OPENCLAW_JSON);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(OPENCLAW_JSON)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8")) as Record<string, unknown>;
      const servers = json["mcpServers"] as Record<string, unknown> | undefined;
      return !!servers?.["datasynx-opencrm"];
    } catch {
      return false;
    }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
    fs.mkdirSync(OPENCLAW_WORKSPACE, { recursive: true });

    const harnessFiles: string[] = [];

    // 1. openclaw.json — register MCP server (stdio + optional HTTP disabled by default)
    let json: Record<string, unknown> = {};
    if (fs.existsSync(OPENCLAW_JSON)) {
      try {
        json = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8")) as Record<string, unknown>;
      } catch {}
    }
    if (!json["mcpServers"]) json["mcpServers"] = {};
    const servers = json["mcpServers"] as Record<string, unknown>;

    servers[config.serverName] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      transport: "stdio",
      env: { DXCRM_DATA_DIR: config.dataDir },
    };

    // HTTP entry (disabled by default — user activates when daemon runs with --http)
    servers[`${config.serverName}-http`] = {
      url: `http://localhost:${config.httpPort}/mcp`,
      transport: "streamable-http",
      enabled: false,
    };

    fs.writeFileSync(OPENCLAW_JSON, JSON.stringify(json, null, 2));
    // Gateway hot-reloads config — no restart needed

    // 2. SOUL.md in OpenClaw workspace
    const soulPath = path.join(OPENCLAW_WORKSPACE, "SOUL.md");
    if (!fs.existsSync(soulPath)) {
      fs.writeFileSync(soulPath, buildSoulMd("openclaw"));
      harnessFiles.push(soulPath);
    } else {
      const existing = fs.readFileSync(soulPath, "utf-8");
      if (!existing.includes("DatasynxOpenCRM")) {
        fs.appendFileSync(soulPath, "\n\n---\n\n" + buildCrmSoulAppend());
        harnessFiles.push(soulPath + " (appended)");
      }
    }

    // 3. AGENTS.md in OpenClaw workspace
    const agentsPath = path.join(OPENCLAW_WORKSPACE, "AGENTS.md");
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

    // 4. TOOLS.md — hint about CRM tools
    const toolsPath = path.join(OPENCLAW_WORKSPACE, "TOOLS.md");
    const toolsContent = buildOpenClawToolsMd();
    if (!fs.existsSync(toolsPath)) {
      fs.writeFileSync(toolsPath, toolsContent);
    } else if (!fs.readFileSync(toolsPath, "utf-8").includes("datasynx-opencrm")) {
      fs.appendFileSync(toolsPath, "\n\n" + toolsContent);
    }
    harnessFiles.push(toolsPath);

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: OPENCLAW_JSON,
      harnessFiles,
      notes: "Config hot-reloaded by Gateway. SOUL.md + AGENTS.md + TOOLS.md written to workspace.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(OPENCLAW_JSON)) return;
    try {
      const json = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8")) as Record<string, unknown>;
      const servers = json["mcpServers"] as Record<string, unknown> | undefined;
      if (servers) {
        delete servers["datasynx-opencrm"];
        delete servers["datasynx-opencrm-http"];
      }
      fs.writeFileSync(OPENCLAW_JSON, JSON.stringify(json, null, 2));
    } catch {}
  }
}

function buildCrmSoulAppend(): string {
  return `## CRM Integration
I have access to DatasynxOpenCRM. I always load customer context before discussing customers.
I log every interaction without being asked. I cite sources when referencing customer data.`;
}

function buildOpenClawToolsMd(): string {
  return `## datasynx-opencrm MCP Tools
- get_customer_context(slug) — load full customer briefing
- search_customer_knowledge(slug, query) — search emails + transcripts
- list_customers() — pipeline overview
- log_interaction(slug, type, summary) — write to CRM
- update_deal(slug, dealName, fields) — pipeline update
- get_capabilities() — full reference`;
}
