import { Command } from "commander";
import { info, success, error } from "../ui/colors.js";
import type { Policy } from "../core/approvals.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const approvalsCommand = new Command("approvals").description(
  "Human-in-the-loop approval queue"
);

approvalsCommand
  .command("list")
  .description("List approvals (default: pending)")
  .option("--status <status>", "pending | approved | rejected", "pending")
  .action(async (opts: { status: string }) => {
    const { listApprovals } = await import("../core/approvals.js");
    const list = listApprovals(dataDir(), opts.status as "pending" | "approved" | "rejected");
    if (list.length === 0) {
      console.log(info(`No ${opts.status} approvals.`));
      return;
    }
    for (const a of list) console.log(`${a.id}  ${a.tool}  ${a.slug ?? "-"}  ${a.requestedAt}`);
  });

approvalsCommand
  .command("approve <id>")
  .description("Approve a pending action")
  .action(async (id: string) => {
    const { decideApproval } = await import("../core/approvals.js");
    if (decideApproval(dataDir(), id, "approved")) console.log(success(`Approved ${id}`));
    else {
      console.error(error(`Not found: ${id}`));
      process.exitCode = 1;
    }
  });

approvalsCommand
  .command("reject <id>")
  .description("Reject a pending action")
  .action(async (id: string) => {
    const { decideApproval } = await import("../core/approvals.js");
    if (decideApproval(dataDir(), id, "rejected")) console.log(success(`Rejected ${id}`));
    else {
      console.error(error(`Not found: ${id}`));
      process.exitCode = 1;
    }
  });

export const policyCommand = new Command("policy").description(
  "Autonomy policy per tool/customer (auto|approve|block)"
);

policyCommand
  .command("set <tool> <policy>")
  .description("Set autonomy policy for a tool (optionally per --slug)")
  .option("--slug <slug>", "Customer slug (per-customer override)")
  .action(async (tool: string, policy: string, opts: { slug?: string }) => {
    if (!["auto", "approve", "block"].includes(policy)) {
      console.error(error("policy must be auto | approve | block"));
      process.exitCode = 1;
      return;
    }
    const { setPolicy } = await import("../core/approvals.js");
    setPolicy(dataDir(), tool, policy as Policy, opts.slug);
    console.log(success(`Policy ${tool}${opts.slug ? `@${opts.slug}` : ""} = ${policy}`));
  });
