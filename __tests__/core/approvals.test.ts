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
async function mod() {
  return import("../../src/core/approvals.js");
}

describe("getPolicy", () => {
  it("resolves customer → global tool → default (auto)", async () => {
    vol.fromJSON({
      "/crm/.agentic/policy.json": JSON.stringify({
        default: "auto",
        tools: { update_deal: "approve" },
        customers: { acme: { update_deal: "block" } },
      }),
    });
    const { getPolicy } = await mod();
    expect(getPolicy(DATA_DIR, "update_deal", "acme")).toBe("block"); // customer override
    expect(getPolicy(DATA_DIR, "update_deal", "beta")).toBe("approve"); // global tool
    expect(getPolicy(DATA_DIR, "log_interaction")).toBe("auto"); // default
  });

  it("defaults to auto with no policy file", async () => {
    vol.fromJSON({});
    const { getPolicy } = await mod();
    expect(getPolicy(DATA_DIR, "update_deal")).toBe("auto");
  });
});

describe("gateAction", () => {
  it("executes immediately when policy=auto", async () => {
    vol.fromJSON({});
    const { gateAction } = await mod();
    const r = await gateAction(DATA_DIR, { tool: "update_deal", payload: {} }, () => "done");
    expect(r.status).toBe("executed");
    expect(r.result).toBe("done");
  });

  it("queues a pending approval when policy=approve", async () => {
    vol.fromJSON({
      "/crm/.agentic/policy.json": JSON.stringify({ tools: { update_deal: "approve" } }),
    });
    const { gateAction, listApprovals } = await mod();
    const r = await gateAction(
      DATA_DIR,
      { tool: "update_deal", slug: "acme", payload: { x: 1 } },
      () => "x"
    );
    expect(r.status).toBe("pending");
    expect(r.approvalId).toBeTruthy();
    expect(listApprovals(DATA_DIR, "pending")).toHaveLength(1);
  });

  it("blocks when policy=block", async () => {
    vol.fromJSON({
      "/crm/.agentic/policy.json": JSON.stringify({ tools: { update_deal: "block" } }),
    });
    const { gateAction } = await mod();
    const r = await gateAction(DATA_DIR, { tool: "update_deal", payload: {} }, () => "x");
    expect(r.status).toBe("blocked");
  });
});

describe("approval queue", () => {
  it("approves a pending request", async () => {
    vol.fromJSON({ "/crm/.agentic/policy.json": JSON.stringify({ tools: { x: "approve" } }) });
    const { gateAction, decideApproval, listApprovals } = await mod();
    const r = await gateAction(DATA_DIR, { tool: "x", payload: {} }, () => "x");
    const ok = decideApproval(DATA_DIR, r.approvalId!, "approved");
    expect(ok).toBe(true);
    expect(listApprovals(DATA_DIR, "pending")).toHaveLength(0);
    expect(listApprovals(DATA_DIR, "approved")).toHaveLength(1);
  });
});
