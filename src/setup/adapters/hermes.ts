// src/setup/adapters/hermes.ts
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildHermesSoulMd, buildHermesSkillMd } from "../harness-content.js";

const HOME = os.homedir();
const HERMES_HOME = process.env["HERMES_HOME"] ?? path.join(HOME, ".hermes");
const HERMES_CONFIG = path.join(HERMES_HOME, "config.yaml");
const HERMES_SOUL = path.join(HERMES_HOME, "SOUL.md");
const HERMES_SKILLS = path.join(HERMES_HOME, "skills");

export class HermesAdapter implements FrameworkAdapter {
  readonly name = "Hermes Agent";

  detect(): boolean {
    try {
      execSync("which hermes", { stdio: "ignore" });
      return true;
    } catch {}
    return fs.existsSync(HERMES_HOME) || fs.existsSync(HERMES_CONFIG);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(HERMES_CONFIG)) return false;
    return fs.readFileSync(HERMES_CONFIG, "utf-8").includes("datasynx");
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(HERMES_HOME, { recursive: true });
    fs.mkdirSync(HERMES_SKILLS, { recursive: true });

    const harnessFiles: string[] = [];

    // 1. config.yaml — write/merge mcp_servers block
    // Server name MUST use underscore: datasynx_opencrm (avoids tool prefix issues)
    this.writeMcpConfig(config);

    // 2. SOUL.md — Slot #1 in system prompt, always injected
    if (!fs.existsSync(HERMES_SOUL)) {
      fs.writeFileSync(HERMES_SOUL, buildHermesSoulMd("hermes"));
      harnessFiles.push(HERMES_SOUL);
    } else {
      const existing = fs.readFileSync(HERMES_SOUL, "utf-8");
      if (!existing.includes("DatasynxOpenCRM")) {
        fs.appendFileSync(
          HERMES_SOUL,
          "\n\n---\n\n## CRM Integration\nI have access to DatasynxOpenCRM MCP tools.\nI always load customer context before discussing customers.\nI log every interaction automatically via log_interaction()."
        );
        harnessFiles.push(HERMES_SOUL + " (appended)");
      }
    }

    // 3. Skill file — agentskills.io standard
    // Hermes reads all .md files in ~/.hermes/skills/ as skills
    const skillPath = path.join(HERMES_SKILLS, "datasynx-crm.md");
    fs.writeFileSync(skillPath, buildHermesSkillMd());
    harnessFiles.push(skillPath);

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: HERMES_CONFIG,
      harnessFiles,
      notes:
        "SOUL.md updated (Slot #1 system prompt). Skill registered in ~/.hermes/skills/. Server name uses underscore: datasynx_opencrm.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(HERMES_CONFIG)) return;
    const content = fs.readFileSync(HERMES_CONFIG, "utf-8");
    // Remove the datasynx_opencrm block from mcp_servers
    const cleaned = content.replace(/\n  datasynx[_-]opencrm:[\s\S]*?(?=\n  \w|\n[a-z]|$)/, "");
    fs.writeFileSync(HERMES_CONFIG, cleaned);
    // Remove skill file
    const skillPath = path.join(HERMES_SKILLS, "datasynx-crm.md");
    if (fs.existsSync(skillPath)) fs.unlinkSync(skillPath);
  }

  private writeMcpConfig(config: InstallConfig): void {
    // Hermes config.yaml: YAML format, mcp_servers section
    // Server name: datasynx_opencrm (UNDERSCORE — avoids tool name prefix issues)
    let content = fs.existsSync(HERMES_CONFIG) ? fs.readFileSync(HERMES_CONFIG, "utf-8") : "";

    if (content.includes("datasynx")) return; // Idempotent

    if (content.includes("mcp_servers:")) {
      // Existing mcp_servers section — inject our entry below it
      content = content.replace(
        "mcp_servers:",
        [
          "mcp_servers:",
          "  datasynx_opencrm:",
          `    command: ${JSON.stringify(process.execPath)}`,
          `    args: [${JSON.stringify(config.mcpServerPath)}]`,
          `    env:`,
          `      DXCRM_DATA_DIR: ${JSON.stringify(config.dataDir)}`,
          `    timeout: 120`,
          `    connect_timeout: 30`,
          `    enabled: true`,
          `    tools:`,
          `      include: [get_capabilities, get_active_session, get_customer_context, search_customer_knowledge, list_customers, log_interaction, update_deal, export_customer]`,
          `      prompts: false`,
          `      resources: false`,
        ].join("\n")
      );
      fs.writeFileSync(HERMES_CONFIG, content);
    } else {
      // No mcp_servers section — append full block
      const mcpBlock = [
        ``,
        `# DatasynxOpenCRM MCP Server (added by dxcrm init)`,
        `mcp_servers:`,
        `  datasynx_opencrm:`,
        `    command: ${JSON.stringify(process.execPath)}`,
        `    args: [${JSON.stringify(config.mcpServerPath)}]`,
        `    env:`,
        `      DXCRM_DATA_DIR: ${JSON.stringify(config.dataDir)}`,
        `    timeout: 120`,
        `    connect_timeout: 30`,
        `    enabled: true`,
        `    tools:`,
        `      include:`,
        `        - get_capabilities`,
        `        - get_active_session`,
        `        - get_customer_context`,
        `        - search_customer_knowledge`,
        `        - list_customers`,
        `        - log_interaction`,
        `        - update_deal`,
        `        - export_customer`,
        `      prompts: false`,
        `      resources: false`,
        ``,
      ].join("\n");

      fs.appendFileSync(HERMES_CONFIG, mcpBlock);
    }
  }
}
