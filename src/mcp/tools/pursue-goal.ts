import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pursueGoal, type BuildInputFn } from "../../core/goal-engine.js";
import { enforceRbac } from "../../core/rbac.js";
import { getActor } from "../../fs/audit-log.js";

const DATA_DIR = process.cwd();

export async function handlePursueGoal(
  input: { goal: string; deadline: string; context?: string },
  dataDir: string = DATA_DIR,
  options: { buildInputFn?: BuildInputFn; llmFn?: (p: string) => Promise<string> } = {}
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    enforceRbac(dataDir, "pursue_goal");

    const goal = await pursueGoal(
      dataDir,
      { description: input.goal, deadline: input.deadline, ...(input.context ? { context: input.context } : {}) },
      { actor: getActor(), ...(options.buildInputFn ? { buildInputFn: options.buildInputFn } : {}), ...(options.llmFn ? { llmFn: options.llmFn } : {}) }
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          goalId: goal.id,
          description: goal.description,
          target: goal.target,
          deadline: goal.deadline,
          type: goal.type,
          decomposition: {
            analysis: goal.decomposition.analysis,
            currentPipeline: goal.decomposition.currentPipeline,
            gap: goal.decomposition.gap,
            subGoals: goal.decomposition.subGoals,
            probabilisticOutcome: goal.decomposition.probabilisticOutcome,
          },
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerPursueGoal(server: McpServer): void {
  server.registerTool(
    "pursue_goal",
    {
      title: "Pursue Goal",
      description: `Set a revenue or pipeline goal and get an AI-decomposed action plan.

Analyzes current pipeline (P50 forecast) and decomposes the gap into prioritized sub-goals per deal. Persists the goal in .agentic/goals.json for tracking.

RBAC: manager+

Args:
  goal: Natural language goal description (e.g. "Close €500k ARR this quarter")
  deadline: Target deadline (YYYY-MM-DD)
  context: Optional constraints (e.g. "Focus on existing pipeline only")

Returns: { goalId, description, target, deadline, decomposition: { analysis, currentPipeline, gap, subGoals, probabilisticOutcome } }`,
      inputSchema: z.object({
        goal: z.string().describe("Natural language goal (e.g. 'Close €500k ARR this quarter')"),
        deadline: z.string().describe("Target deadline YYYY-MM-DD"),
        context: z.string().optional().describe("Optional constraints or focus areas"),
      }),
    },
    async ({ goal, deadline, context }) =>
      handlePursueGoal({ goal, deadline, ...(context !== undefined ? { context } : {}) }, DATA_DIR)
  );
}
