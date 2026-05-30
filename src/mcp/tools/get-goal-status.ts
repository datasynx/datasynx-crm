import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readGoals, getActiveGoals } from "../../core/goal-engine.js";

const DATA_DIR = process.cwd();

export async function handleGetGoalStatus(
  input: { goalId?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const allGoals = input.goalId
      ? readGoals(dataDir).filter((g) => g.id === input.goalId)
      : getActiveGoals(dataDir);

    if (input.goalId && allGoals.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: `Goal '${input.goalId}' not found` },
              null,
              2
            ),
          },
        ],
      };
    }

    const goals = allGoals.map((g) => {
      const deadlineMs = new Date(g.deadline).getTime();
      const todayMs = new Date(today).getTime();
      const daysRemaining = Math.max(0, Math.ceil((deadlineMs - todayMs) / 86_400_000));
      return {
        id: g.id,
        description: g.description,
        target: g.target,
        progress: g.progress,
        status: g.status,
        deadline: g.deadline,
        daysRemaining,
        subGoals: g.decomposition.subGoals.slice(0, 3),
        createdAt: g.createdAt,
      };
    });

    const active = allGoals.filter((g) => g.status === "active");
    const completed = allGoals.filter((g) => g.status === "completed");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { goals, activeCount: active.length, completedCount: completed.length },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
        },
      ],
    };
  }
}

export function registerGetGoalStatus(server: McpServer): void {
  server.registerTool(
    "get_goal_status",
    {
      title: "Get Goal Status",
      description: `Get the status of active goals. Without goalId, returns all active goals. With goalId, returns that specific goal.

Returns progress, days remaining, and top sub-goals for each goal.

Args:
  goalId: (optional) Specific goal ID — if omitted, returns all active goals

Returns: { goals: [{ id, description, target, progress, status, deadline, daysRemaining, subGoals }], activeCount, completedCount }`,
      inputSchema: z.object({
        goalId: z.string().optional().describe("Specific goal ID (omit for all active goals)"),
      }),
    },
    async ({ goalId }) =>
      handleGetGoalStatus({ ...(goalId !== undefined ? { goalId } : {}) }, DATA_DIR)
  );
}
