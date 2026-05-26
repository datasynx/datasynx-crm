import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

vi.mock("child_process", () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error("not found");
  }),
}));

import { HermesAdapter } from "../../src/setup/adapters/hermes.js";

const HOME = os.homedir();
const HERMES_HOME = path.join(HOME, ".hermes");
const HERMES_CONFIG = path.join(HERMES_HOME, "config.yaml");
const HERMES_SOUL = path.join(HERMES_HOME, "SOUL.md");
const HERMES_SKILLS = path.join(HERMES_HOME, "skills");

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("HermesAdapter", () => {
  it("detect() returns true when ~/.hermes/ exists", () => {
    vol.fromJSON({ [`${HERMES_HOME}/.keep`]: "" });
    const adapter = new HermesAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns true when ~/.hermes/config.yaml exists", () => {
    vol.fromJSON({ [HERMES_CONFIG]: "version: 1\n" });
    const adapter = new HermesAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns false when nothing exists", () => {
    const adapter = new HermesAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("install() writes mcp_servers block to config.yaml", async () => {
    const adapter = new HermesAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(HERMES_CONFIG, "utf-8") as string;
    expect(content).toContain("mcp_servers:");
    expect(content).toContain("datasynx_opencrm:");
    expect(content).toContain("timeout: 120");
    expect(content).toContain("connect_timeout: 30");
    expect(content).toContain("enabled: true");
  });

  it("install() uses underscore in server name (datasynx_opencrm not datasynx-opencrm)", async () => {
    const adapter = new HermesAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(HERMES_CONFIG, "utf-8") as string;
    expect(content).toContain("datasynx_opencrm:");
    // Verify no hyphen version in server name (the config.serverName is still used for env/args)
    expect(content).not.toContain("datasynx-opencrm:");
  });

  it("install() appends to existing config.yaml with mcp_servers section", async () => {
    vol.fromJSON({
      [HERMES_CONFIG]: "version: 1\nmcp_servers:\n  other_server:\n    command: other\n",
    });

    const adapter = new HermesAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(HERMES_CONFIG, "utf-8") as string;
    expect(content).toContain("other_server:");
    expect(content).toContain("datasynx_opencrm:");
  });

  it("install() is idempotent — calling twice does not duplicate", async () => {
    const adapter = new HermesAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(HERMES_CONFIG, "utf-8") as string;
    const matches = content.match(/datasynx_opencrm:/g);
    expect(matches?.length).toBe(1);
  });

  it("install() creates SOUL.md at ~/.hermes/SOUL.md", async () => {
    const adapter = new HermesAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(HERMES_SOUL)).toBe(true);
    const content = fs.readFileSync(HERMES_SOUL, "utf-8") as string;
    expect(content).toContain("Identity");
    expect(content).toContain("customer");
  });

  it("install() appends to existing SOUL.md without overwriting when CRM marker missing", async () => {
    vol.fromJSON({ [HERMES_SOUL]: "# My existing soul\nI am an agent." });

    const adapter = new HermesAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(HERMES_SOUL, "utf-8") as string;
    expect(content).toContain("My existing soul");
    expect(content).toContain("DatasynxOpenCRM");
  });

  it("install() does not modify SOUL.md if DatasynxOpenCRM marker already present", async () => {
    vol.fromJSON({
      [HERMES_SOUL]: "# Soul with DatasynxOpenCRM integration.",
    });

    const adapter = new HermesAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(HERMES_SOUL, "utf-8") as string;
    const matches = content.match(/DatasynxOpenCRM/g);
    expect(matches?.length).toBe(1);
  });

  it("install() creates skill at ~/.hermes/skills/datasynx-crm.md", async () => {
    const adapter = new HermesAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const skillPath = path.join(HERMES_SKILLS, "datasynx-crm.md");
    expect(fs.existsSync(skillPath)).toBe(true);
    const content = fs.readFileSync(skillPath, "utf-8") as string;
    expect(content).toContain("name: datasynx-crm");
    expect(content).toContain("get_customer_context");
    expect(result.harnessFiles).toContain(skillPath);
  });

  it("install() returns correct framework name", async () => {
    const adapter = new HermesAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.framework).toBe("Hermes Agent");
    expect(result.success).toBe(true);
    expect(result.transport).toBe("stdio");
    expect(result.configPath).toBe(HERMES_CONFIG);
  });

  it("install() notes mention SOUL.md and skills", async () => {
    const adapter = new HermesAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.notes).toContain("SOUL.md");
    expect(result.notes).toContain("skills");
  });

  it("uninstall() removes mcp block and skill file", async () => {
    const adapter = new HermesAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const skillPath = path.join(HERMES_SKILLS, "datasynx-crm.md");
    expect(fs.existsSync(skillPath)).toBe(true);

    await adapter.uninstall();

    const content = fs.readFileSync(HERMES_CONFIG, "utf-8") as string;
    expect(content).not.toContain("datasynx_opencrm:");
    expect(fs.existsSync(skillPath)).toBe(false);
  });

  it("isInstalled() returns false before install", () => {
    const adapter = new HermesAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("isInstalled() returns true after install", async () => {
    const adapter = new HermesAdapter();
    await adapter.install(TEST_CONFIG);
    expect(adapter.isInstalled()).toBe(true);
  });

  it("name is 'Hermes Agent'", () => {
    expect(new HermesAdapter().name).toBe("Hermes Agent");
  });
});
