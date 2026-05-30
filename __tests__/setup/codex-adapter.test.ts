import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

vi.mock("child_process", () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error("not found");
  }),
}));

import { CodexAdapter } from "../../src/setup/adapters/codex.js";

const HOME = os.homedir();
const CODEX_DIR = path.join(HOME, ".codex");
const CODEX_CONFIG = path.join(CODEX_DIR, "config.toml");

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("CodexAdapter", () => {
  it("detect() returns true when ~/.codex/ exists", () => {
    vol.fromJSON({ [`${CODEX_DIR}/.keep`]: "" });
    const adapter = new CodexAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns false when ~/.codex/ does not exist", () => {
    const adapter = new CodexAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("install() creates config.toml when it doesn't exist", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new CodexAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(CODEX_CONFIG)).toBe(true);
  });

  it("install() appends [mcp_servers.datasynx-opencrm] block to config.toml", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new CodexAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(CODEX_CONFIG, "utf-8") as string;
    expect(content).toContain("[mcp_servers.datasynx-opencrm]");
    expect(content).toContain("startup_timeout_sec = 30");
    expect(content).toContain("tool_timeout_sec = 120");
    expect(content).toContain("enabled = true");
  });

  it("install() is idempotent — calling twice does not duplicate block", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new CodexAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(CODEX_CONFIG, "utf-8") as string;
    const matches = content.match(/\[mcp_servers\.datasynx-opencrm\]/g);
    expect(matches?.length).toBe(1);
  });

  it("install() writes AGENTS.md to dataDir", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new CodexAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const agentsPath = path.join(TEST_CONFIG.dataDir, "AGENTS.md");
    expect(fs.existsSync(agentsPath)).toBe(true);
    const content = fs.readFileSync(agentsPath, "utf-8") as string;
    expect(content).toContain("DatasynxOpenCRM");
    expect(result.harnessFiles).toContain(agentsPath);
  });

  it("install() does not overwrite existing AGENTS.md with CRM content", async () => {
    const existingAgents = "# DatasynxOpenCRM Agent\nAlready has CRM content.";
    vol.fromJSON({
      [TEST_CONFIG.dataDir]: null,
      [path.join(TEST_CONFIG.dataDir, "AGENTS.md")]: existingAgents,
    });

    const adapter = new CodexAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(path.join(TEST_CONFIG.dataDir, "AGENTS.md"), "utf-8") as string;
    // Should not duplicate since it already contains "DatasynxOpenCRM"
    const matches = content.match(/DatasynxOpenCRM/g);
    expect(matches?.length).toBe(1);
  });

  it("install() appends to existing AGENTS.md if it lacks CRM content", async () => {
    const existingAgents = "# My Custom Agents\nSome other content.";
    vol.fromJSON({
      [TEST_CONFIG.dataDir]: null,
      [path.join(TEST_CONFIG.dataDir, "AGENTS.md")]: existingAgents,
    });

    const adapter = new CodexAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(path.join(TEST_CONFIG.dataDir, "AGENTS.md"), "utf-8") as string;
    expect(content).toContain("My Custom Agents");
    expect(content).toContain("DatasynxOpenCRM");
  });

  it("install() returns correct framework name and transport", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new CodexAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.framework).toBe("Codex");
    expect(result.success).toBe(true);
    expect(result.transport).toBe("stdio");
    expect(result.configPath).toBe(CODEX_CONFIG);
  });

  it("uninstall() removes only the datasynx-opencrm block", async () => {
    const initialContent = [
      "[other_server]",
      'command = "other"',
      "",
      "[mcp_servers.datasynx-opencrm]",
      'command = "/usr/bin/node"',
      "enabled = true",
      "",
    ].join("\n");
    vol.fromJSON({ [CODEX_CONFIG]: initialContent });

    const adapter = new CodexAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = fs.readFileSync(CODEX_CONFIG, "utf-8") as string;
    expect(content).toContain("[other_server]");
    expect(content).not.toContain("[mcp_servers.datasynx-opencrm]");
  });

  it("isInstalled() returns false before install", () => {
    const adapter = new CodexAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("isInstalled() returns true after install", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new CodexAdapter();
    await adapter.install(TEST_CONFIG);
    expect(adapter.isInstalled()).toBe(true);
  });

  it("name is 'Codex'", () => {
    expect(new CodexAdapter().name).toBe("Codex");
  });
});
