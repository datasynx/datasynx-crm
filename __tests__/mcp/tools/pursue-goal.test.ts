import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

const mockBuildFn = async () => ({
  deals: [
    { slug: "acme", name: "Enterprise", stage: "negotiation", value: 80000, probability: 60, healthScore: 50, daysSinceContact: 5, championPresent: false },
  ],
  externalSignals: [] as [],
  iterations: 100,
  horizon: "quarter" as const,
  today: "2026-05-27",
});

describe("pursue_goal tool", () => {
  it("creates a goal and returns goalId + decomposition", async () => {
    vol.fromJSON({});
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    const res = await handlePursueGoal(
      { goal: "Close €500k ARR this quarter", deadline: "2026-09-30" },
      DATA_DIR,
      { buildInputFn: mockBuildFn }
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.goalId).toMatch(/^goal_/);
    expect(data.target).toBe(500000);
    expect(data.decomposition).toBeDefined();
    expect(Array.isArray(data.decomposition.subGoals)).toBe(true);
  });

  it("decomposition.gap = target - currentPipeline", async () => {
    vol.fromJSON({});
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    const res = await handlePursueGoal(
      { goal: "Close €500k this quarter", deadline: "2026-09-30" },
      DATA_DIR,
      { buildInputFn: mockBuildFn }
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.decomposition.gap).toBe(data.target - data.decomposition.currentPipeline);
  });

  it("returns error when RBAC denies access (rep actor)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/rbac.json`]: JSON.stringify({ actors: { alice: "rep" } }),
    });
    process.env["DXCRM_ACTOR"] = "alice";
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    const res = await handlePursueGoal(
      { goal: "Close €500k", deadline: "2026-09-30" },
      DATA_DIR,
      { buildInputFn: mockBuildFn }
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Access denied");
    delete process.env["DXCRM_ACTOR"];
  });

  it("allows manager actor", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/rbac.json`]: JSON.stringify({ actors: { bob: "manager" } }),
    });
    process.env["DXCRM_ACTOR"] = "bob";
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    const res = await handlePursueGoal(
      { goal: "Close €200k this quarter", deadline: "2026-09-30" },
      DATA_DIR,
      { buildInputFn: mockBuildFn }
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.goalId).toMatch(/^goal_/);
    delete process.env["DXCRM_ACTOR"];
  });

  it("uses context field when provided", async () => {
    vol.fromJSON({});
    let capturedDesc = "";
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    await handlePursueGoal(
      { goal: "Close €100k this quarter", deadline: "2026-09-30", context: "Existing pipeline only" },
      DATA_DIR,
      {
        buildInputFn: mockBuildFn,
        llmFn: async (p) => { capturedDesc = p; return "{}"; },
      }
    );
    expect(capturedDesc).toContain("Close €100k");
  });

  it("goal persisted — second call reads previous goal", async () => {
    vol.fromJSON({});
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    await handlePursueGoal({ goal: "Close €100k", deadline: "2026-09-30" }, DATA_DIR, { buildInputFn: mockBuildFn });
    await handlePursueGoal({ goal: "Close €200k", deadline: "2026-12-31" }, DATA_DIR, { buildInputFn: mockBuildFn });
    const { readGoals } = await import("../../../src/core/goal-engine.js");
    expect(readGoals(DATA_DIR)).toHaveLength(2);
  });

  it("registers tool with correct name", async () => {
    const { registerPursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    const calls: string[] = [];
    const fakeServer = { registerTool: (name: string) => calls.push(name) };
    registerPursueGoal(fakeServer as never);
    expect(calls).toContain("pursue_goal");
  });

  it("returns error response on unexpected exception", async () => {
    vol.fromJSON({});
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    const badBuildFn = async () => { throw new Error("network timeout"); };
    const res = await handlePursueGoal(
      { goal: "Close €100k", deadline: "2026-09-30" },
      DATA_DIR,
      { buildInputFn: badBuildFn as never }
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(false);
  });
});
