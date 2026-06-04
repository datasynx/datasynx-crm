import type { PipelineDeal } from "../schemas/pipeline.js";

/**
 * Opportunity (win-likelihood) scoring (N2-1): a deterministic 0–100 score that
 * blends the deal's pipeline stage with its probability, plus an A–F grade.
 * Complements get_deal_health (activity-based) with a forecast-oriented view.
 */
const STAGE_WEIGHT: Record<PipelineDeal["stage"], number> = {
  lead: 10,
  qualified: 30,
  proposal: 55,
  negotiation: 75,
  won: 100,
  lost: 0,
};

export interface OpportunityScore {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  factors: { stageWeight: number; probability?: number };
}

function grade(score: number): OpportunityScore["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

export function scoreOpportunity(deal: PipelineDeal): OpportunityScore {
  const stageWeight = STAGE_WEIGHT[deal.stage] ?? 10;
  // Closed deals are definitive.
  if (deal.stage === "won") return { score: 100, grade: "A", factors: { stageWeight } };
  if (deal.stage === "lost") return { score: 0, grade: "F", factors: { stageWeight } };

  const score =
    typeof deal.probability === "number"
      ? Math.round((stageWeight + deal.probability) / 2)
      : stageWeight;

  return {
    score,
    grade: grade(score),
    factors: {
      stageWeight,
      ...(typeof deal.probability === "number" ? { probability: deal.probability } : {}),
    },
  };
}
