import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

beforeEach(() => vol.reset());

describe("validateCommand handler", () => {
  it("passes for valid customer", async () => {
    // Use quoted dates in YAML to ensure gray-matter parses them as strings, not JS Dates
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": `---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
      "/crm/customers/acme-corp/interactions.md": "# Interactions\n",
    });
    const { MainFactsSchema } = await import("../../src/schemas/main-facts.js");
    const matter = await import("gray-matter");
    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync(
      "/crm/customers/acme-corp/main_facts.md",
      "utf-8"
    ) as string;
    const { data } = matter.default(content);
    expect(() => MainFactsSchema.parse(data)).not.toThrow();
  });

  it("fails for missing main_facts.md", () => {
    const { fs: memFs } = require("memfs");
    expect(memFs.existsSync("/crm/customers/bad-co/main_facts.md")).toBe(false);
  });

  it("rejects invalid relationship_stage", async () => {
    vol.fromJSON({
      "/crm/customers/bad-corp/main_facts.md": `---\nname: Bad Corp\nrelationship_stage: invalid_stage\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { MainFactsSchema } = await import("../../src/schemas/main-facts.js");
    const matter = await import("gray-matter");
    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync(
      "/crm/customers/bad-corp/main_facts.md",
      "utf-8"
    ) as string;
    const { data } = matter.default(content);
    expect(() => MainFactsSchema.parse(data)).toThrow();
  });

  it("rejects missing name", async () => {
    vol.fromJSON({
      "/crm/customers/no-name/main_facts.md": `---\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { MainFactsSchema } = await import("../../src/schemas/main-facts.js");
    const matter = await import("gray-matter");
    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync(
      "/crm/customers/no-name/main_facts.md",
      "utf-8"
    ) as string;
    const { data } = matter.default(content);
    expect(() => MainFactsSchema.parse(data)).toThrow();
  });
});
