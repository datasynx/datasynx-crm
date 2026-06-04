import { describe, it, expect } from "vitest";
import { scoreOpportunity } from "../../src/core/opportunity-score.js";
import type { PipelineDeal } from "../../src/schemas/pipeline.js";

function deal(p: Partial<PipelineDeal>): PipelineDeal {
  return {
    name: "D",
    stage: "qualified",
    currency: "EUR",
    updated: "2026-01-01",
    ...p,
  } as PipelineDeal;
}

describe("scoreOpportunity", () => {
  it("scores won at 100 (grade A) and lost at 0 (grade F)", () => {
    expect(scoreOpportunity(deal({ stage: "won" })).score).toBe(100);
    expect(scoreOpportunity(deal({ stage: "won" })).grade).toBe("A");
    expect(scoreOpportunity(deal({ stage: "lost" })).score).toBe(0);
    expect(scoreOpportunity(deal({ stage: "lost" })).grade).toBe("F");
  });

  it("blends stage weight with probability when present", () => {
    const r = scoreOpportunity(deal({ stage: "negotiation", probability: 80 }));
    expect(r.score).toBe(78); // (75 + 80) / 2
    expect(r.grade).toBe("B");
    expect(r.factors.stageWeight).toBe(75);
  });

  it("uses stage weight alone when no probability", () => {
    expect(scoreOpportunity(deal({ stage: "qualified" })).score).toBe(30);
    expect(scoreOpportunity(deal({ stage: "proposal" })).score).toBe(55);
  });
});
