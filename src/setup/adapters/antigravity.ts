// src/setup/adapters/antigravity.ts
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildAgentsMd, buildAgySkillMd, buildAgyGeminiMd } from "../harness-content.js";

const HOME = os.homedir();
const AGY_BIN_UNIX = path.join(HOME, ".local", "bin", "agy");

// Shared config (CLI + IDE) — preferred
const GEMINI_CONFIG_DIR = path.join(HOME, ".gemini", "config");
const SHARED_MCP_CONFIG = path.join(GEMINI_CONFIG_DIR, "mcp_config.json");

// CLI-only config (fallback)
const AGY_DIR = path.join(HOME, ".gemini", "antigravity");
const AGY_MCP_CONFIG = path.join(AGY_DIR, "mcp_config.json");

// Global context file
const GEMINI_GLOBAL_MD = path.join(HOME, ".gemini", "GEMINI.md");

// Skills — directory-based (not single file like Hermes)
const AGY_SKILLS_DIR = path.join(HOME, ".gemini", "antigravity-cli", "skills");

export class AntigravityAdapter implements FrameworkAdapter {
  readonly name = "Antigravity CLI";

  detect(): boolean {
    // Binary check: agy (NOT antigravity!)
    try {
      execSync("which agy", { stdio: "ignore" });
      return true;
    } catch {}
    // Installation path check
    if (fs.existsSync(AGY_BIN_UNIX)) return true;
    // Gemini directory (also catches old Gemini CLI users who haven't migrated)
    return fs.existsSync(path.join(HOME, ".gemini"));
  }

  isInstalled(): boolean {
    for (const configPath of [SHARED_MCP_CONFIG, AGY_MCP_CONFIG]) {
      if (!fs.existsSync(configPath)) continue;
      try {
        const json = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        if (json?.mcpServers?.["datasynx-opencrm"]) return true;
      } catch {}
    }
    return false;
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    const harnessFiles: string[] = [];

    // 1. Shared MCP Config (preferred — covers CLI and IDE)
    fs.mkdirSync(GEMINI_CONFIG_DIR, { recursive: true });
    this.writeMcpEntry(SHARED_MCP_CONFIG, config);

    // 2. Global GEMINI.md (~/.gemini/GEMINI.md)
    // Antigravity loads this at each session as global context — keep short (≤50 lines)
    if (!fs.existsSync(GEMINI_GLOBAL_MD)) {
      fs.mkdirSync(path.dirname(GEMINI_GLOBAL_MD), { recursive: true });
      fs.writeFileSync(GEMINI_GLOBAL_MD, buildAgyGeminiMd(config.dataDir));
      harnessFiles.push(GEMINI_GLOBAL_MD);
    } else {
      const existing = fs.readFileSync(GEMINI_GLOBAL_MD, "utf-8");
      if (!existing.includes("DatasynxOpenCRM")) {
        fs.appendFileSync(GEMINI_GLOBAL_MD, "\n\n---\n\n" + buildAgyGeminiMdAppend());
        harnessFiles.push(GEMINI_GLOBAL_MD + " (appended)");
      }
    }

    // 3. AGENTS.md in CRM root (Antigravity reads AGENTS.md in working directory)
    const agentsPath = path.join(config.dataDir, "AGENTS.md");
    fs.mkdirSync(config.dataDir, { recursive: true });
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

    // 4. Skill: ~/.gemini/antigravity-cli/skills/datasynx-crm/SKILL.md
    // Directory-based (unlike Hermes single-file)
    const skillDir = path.join(AGY_SKILLS_DIR, "datasynx-crm");
    fs.mkdirSync(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(skillPath, buildAgySkillMd());
    harnessFiles.push(skillPath);

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: SHARED_MCP_CONFIG,
      harnessFiles,
      notes:
        "Shared config (~/.gemini/config/mcp_config.json) covers both CLI and IDE. Skill registered. GEMINI.md updated.",
    };
  }

  async uninstall(): Promise<void> {
    for (const configPath of [SHARED_MCP_CONFIG, AGY_MCP_CONFIG]) {
      if (!fs.existsSync(configPath)) continue;
      try {
        const json = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        if (json.mcpServers) {
          delete json.mcpServers["datasynx-opencrm"];
          delete json.mcpServers["datasynx-opencrm-http"];
        }
        fs.writeFileSync(configPath, JSON.stringify(json, null, 2));
      } catch {}
    }
    // Remove skill directory
    const skillDir = path.join(AGY_SKILLS_DIR, "datasynx-crm");
    if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true });
  }

  private writeMcpEntry(configPath: string, config: InstallConfig): void {
    let json: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      try {
        json = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        if (!json.mcpServers) json.mcpServers = {};
      } catch {}
    }

    // stdio transport (primary)
    json.mcpServers!["datasynx-opencrm"] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };

    // HTTP transport entry — uses "serverUrl" NOT "url" (Antigravity-specific!)
    json.mcpServers!["datasynx-opencrm-http"] = {
      serverUrl: `http://localhost:${config.httpPort}/mcp`,
    };

    fs.writeFileSync(configPath, JSON.stringify(json, null, 2));
  }
}

function buildAgyGeminiMdAppend(): string {
  return `## DatasynxOpenCRM
CRM MCP tools available: get_customer_context, search_customer_knowledge,
list_customers, log_interaction, update_deal. Always load context first.`;
}
