import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetCapabilities } from "../../../src/mcp/tools/get-capabilities.js";
import { CAPABILITIES_TEXT } from "../../../src/mcp/capabilities.js";

describe("get_capabilities tool", () => {
  it("returns content with CAPABILITIES_TEXT", async () => {
    const result = await handleGetCapabilities();
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    const text = result.content[0];
    expect(text).toBeDefined();
    expect((text as { type: string; text: string }).type).toBe("text");
    expect((text as { type: string; text: string }).text).toBe(CAPABILITIES_TEXT);
  });

  it("CAPABILITIES_TEXT mentions all 8 tools", () => {
    expect(CAPABILITIES_TEXT).toContain("get_capabilities");
    expect(CAPABILITIES_TEXT).toContain("get_active_session");
    expect(CAPABILITIES_TEXT).toContain("get_customer_context");
    expect(CAPABILITIES_TEXT).toContain("search_customer_knowledge");
    expect(CAPABILITIES_TEXT).toContain("list_customers");
    expect(CAPABILITIES_TEXT).toContain("log_interaction");
    expect(CAPABILITIES_TEXT).toContain("update_deal");
    expect(CAPABILITIES_TEXT).toContain("export_customer");
  });

  it("CAPABILITIES_TEXT contains workflow guide", () => {
    expect(CAPABILITIES_TEXT).toContain("Workflow");
  });

  it("does not throw on repeated calls", async () => {
    const a = await handleGetCapabilities();
    const b = await handleGetCapabilities();
    expect((a.content[0] as { text: string }).text).toBe(
      (b.content[0] as { text: string }).text
    );
  });
});
