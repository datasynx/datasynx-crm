import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

vi.mock("child_process", () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error("not found");
  }),
}));

import { AntigravityAdapter } from "../../src/setup/adapters/antigravity.js";

const HOME = os.homedir();
const GEMINI_DIR = path.join(HOME, ".gemini");
const SHARED_MCP_CONFIG = path.join(GEMINI_DIR, "config", "mcp_config.json");
const GEMINI_GLOBAL_MD = path.join(GEMINI_DIR, "GEMINI.md");
const AGY_SKILLS_DIR = path.join(GEMINI_DIR, "antigravity-cli", "skills");

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("AntigravityAdapter", () => {
  it("detect() returns true when ~/.gemini/ exists", () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "" });
    const adapter = new AntigravityAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns false when nothing exists", () => {
    const adapter = new AntigravityAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("install() writes to shared config (~/.gemini/config/mcp_config.json)", async () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "", [TEST_CONFIG.dataDir]: null });
    const adapter = new AntigravityAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(SHARED_MCP_CONFIG)).toBe(true);
    const content = JSON.parse(fs.readFileSync(SHARED_MCP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() uses 'command'/'args' for stdio entry (not serverUrl)", async () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "", [TEST_CONFIG.dataDir]: null });
    const adapter = new AntigravityAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(SHARED_MCP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, { command?: string; args?: string[] }>;
    };
    expect(content.mcpServers["datasynx-opencrm"]?.command).toBe(process.execPath);
    expect(content.mcpServers["datasynx-opencrm"]?.args).toContain(TEST_CONFIG.mcpServerPath);
  });

  it("install() uses 'serverUrl' (not 'url') for HTTP entry — Antigravity-specific", async () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "", [TEST_CONFIG.dataDir]: null });
    const adapter = new AntigravityAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(SHARED_MCP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, { serverUrl?: string; url?: string }>;
    };
    const httpEntry = content.mcpServers["datasynx-opencrm-http"];
    expect(httpEntry?.serverUrl).toBeDefined();
    expect(httpEntry?.url).toBeUndefined(); // MUST use serverUrl, not url
    expect(httpEntry?.serverUrl).toContain(`localhost:${TEST_CONFIG.httpPort}`);
  });

  it("install() creates skill directory with SKILL.md", async () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "", [TEST_CONFIG.dataDir]: null });
    const adapter = new AntigravityAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const skillPath = path.join(AGY_SKILLS_DIR, "datasynx-crm", "SKILL.md");
    expect(fs.existsSync(skillPath)).toBe(true);
    const content = fs.readFileSync(skillPath, "utf-8") as string;
    expect(content).toContain("name: datasynx-crm");
    expect(result.harnessFiles).toContain(skillPath);
  });

  it("install() writes GEMINI.md when it doesn't exist", async () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "", [TEST_CONFIG.dataDir]: null });
    const adapter = new AntigravityAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(GEMINI_GLOBAL_MD)).toBe(true);
    const content = fs.readFileSync(GEMINI_GLOBAL_MD, "utf-8") as string;
    expect(content).toContain("DatasynxOpenCRM");
    expect(result.harnessFiles).toContain(GEMINI_GLOBAL_MD);
  });

  it("install() appends to existing GEMINI.md without overwriting when CRM marker missing", async () => {
    vol.fromJSON({
      [`${GEMINI_DIR}/.keep`]: "",
      [GEMINI_GLOBAL_MD]: "# My Global Context\nSome custom instructions.",
      [TEST_CONFIG.dataDir]: null,
    });

    const adapter = new AntigravityAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(GEMINI_GLOBAL_MD, "utf-8") as string;
    expect(content).toContain("My Global Context");
    expect(content).toContain("DatasynxOpenCRM");
  });

  it("install() does not modify GEMINI.md if DatasynxOpenCRM marker present", async () => {
    vol.fromJSON({
      [`${GEMINI_DIR}/.keep`]: "",
      [GEMINI_GLOBAL_MD]: "# DatasynxOpenCRM — Agent Context already installed.",
      [TEST_CONFIG.dataDir]: null,
    });

    const adapter = new AntigravityAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(GEMINI_GLOBAL_MD, "utf-8") as string;
    const matches = content.match(/DatasynxOpenCRM/g);
    expect(matches?.length).toBe(1);
  });

  it("install() writes AGENTS.md to dataDir", async () => {
    vol.fromJSON({
      [`${GEMINI_DIR}/.keep`]: "",
      [TEST_CONFIG.dataDir]: null,
    });
    const adapter = new AntigravityAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const agentsPath = path.join(TEST_CONFIG.dataDir, "AGENTS.md");
    expect(fs.existsSync(agentsPath)).toBe(true);
    expect(result.harnessFiles).toContain(agentsPath);
  });

  it("install() is idempotent", async () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "", [TEST_CONFIG.dataDir]: null });
    const adapter = new AntigravityAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(SHARED_MCP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    const keys = Object.keys(content.mcpServers).filter((k) => k === "datasynx-opencrm");
    expect(keys.length).toBe(1);
  });

  it("install() returns correct framework name", async () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "", [TEST_CONFIG.dataDir]: null });
    const adapter = new AntigravityAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.framework).toBe("Antigravity CLI");
    expect(result.success).toBe(true);
    expect(result.transport).toBe("stdio");
    expect(result.configPath).toBe(SHARED_MCP_CONFIG);
  });

  it("uninstall() removes mcpServers entry and skill dir", async () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "", [TEST_CONFIG.dataDir]: null });
    const adapter = new AntigravityAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const skillDir = path.join(AGY_SKILLS_DIR, "datasynx-crm");
    expect(fs.existsSync(skillDir)).toBe(true);

    await adapter.uninstall();

    const config = JSON.parse(fs.readFileSync(SHARED_MCP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(config.mcpServers["datasynx-opencrm"]).toBeUndefined();
    expect(fs.existsSync(skillDir)).toBe(false);
  });

  it("isInstalled() returns false before install", () => {
    const adapter = new AntigravityAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("isInstalled() returns true after install", async () => {
    vol.fromJSON({ [`${GEMINI_DIR}/.keep`]: "", [TEST_CONFIG.dataDir]: null });
    const adapter = new AntigravityAdapter();
    await adapter.install(TEST_CONFIG);
    expect(adapter.isInstalled()).toBe(true);
  });

  it("name is 'Antigravity CLI'", () => {
    expect(new AntigravityAdapter().name).toBe("Antigravity CLI");
  });
});
