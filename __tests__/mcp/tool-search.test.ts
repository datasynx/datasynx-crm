import { describe, it, expect } from "vitest";
import { searchTools } from "../../src/mcp/tool-catalog.js";

describe("searchTools", () => {
  it("finds deal-related tools for 'deal'", () => {
    const names = searchTools("deal", 10).map((t) => t.name);
    expect(names).toContain("get_deal_health");
    expect(names).toContain("update_deal");
    expect(names).toContain("open_deal_room");
  });

  it("finds ticket tools for 'ticket'", () => {
    const names = searchTools("ticket").map((t) => t.name);
    expect(names).toContain("create_ticket");
  });

  it("respects the limit and ranks custom-object tools first for 'custom object'", () => {
    const res = searchTools("custom object", 3);
    expect(res.length).toBeLessThanOrEqual(3);
    expect(res[0]!.name).toContain("custom_object");
  });

  it("returns nothing for a query with no overlap", () => {
    expect(searchTools("zzzznotarealtool")).toHaveLength(0);
  });
});
