import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  process.env["DXCRM_DATA_DIR"] = "/crm";
});
afterEach(() => {
  delete process.env["DXCRM_DATA_DIR"];
});

describe("dxcrm policy + approvals", () => {
  it("sets a policy, queues an approval, lists and approves it", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { policyCommand, approvalsCommand } = await import("../../src/commands/approvals.js");

    await policyCommand.parseAsync(["node", "policy", "set", "update_deal", "approve"]);

    const { gateAction } = await import("../../src/core/approvals.js");
    const r = await gateAction("/crm", { tool: "update_deal", payload: {} }, () => "x");
    expect(r.status).toBe("pending");

    await approvalsCommand.parseAsync(["node", "approvals", "list"]);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("update_deal");

    await approvalsCommand.parseAsync(["node", "approvals", "approve", r.approvalId!]);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Approved");
    logSpy.mockRestore();
  });
});
