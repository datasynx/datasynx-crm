import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";

const MAIN = [
  "---",
  "name: Acme",
  "relationship_stage: active",
  "---",
  "",
  "## Quick Reference",
  "Top enterprise account.",
  "",
  "## Contacts",
  "Alice (champion)",
  "",
  "## Critical Context",
  "Renewal in Q3.",
  "",
  "## Open Questions",
  "Budget owner?",
].join("\n");

const INTERACTIONS =
  "# Interactions\n\n## 2026-06-01 · Call\n**Summary:** Renewal discussion\n---\n";
const PIPELINE =
  "# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|---|---|---|---|---|---|---|---|\n| Big | won | 1000 | EUR | 100 | | | 2026-01-01 |\n";

describe("buildContextBlock", () => {
  it("returns a structured context object", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": MAIN,
      "/crm/customers/acme/interactions.md": INTERACTIONS,
      "/crm/customers/acme/pipeline.md": PIPELINE,
    });
    const { buildContextBlock } = await import("../../src/core/context-builder.js");
    const block = await buildContextBlock(DATA_DIR, "acme");

    expect(block.slug).toBe("acme");
    expect(block.metadata["name"]).toBe("Acme");
    expect(block.quickReference).toContain("Top enterprise account");
    expect(block.contacts).toContain("Alice");
    expect(block.criticalContext).toContain("Renewal in Q3");
    expect(block.openQuestions).toContain("Budget owner?");
    expect(block.recentActivity).toContain("Renewal discussion");
    expect(block.pipeline).toContain("Big");
  });

  it("throws for a missing customer", async () => {
    vol.fromJSON({});
    const { buildContextBlock } = await import("../../src/core/context-builder.js");
    await expect(buildContextBlock(DATA_DIR, "ghost")).rejects.toThrow();
  });
});
