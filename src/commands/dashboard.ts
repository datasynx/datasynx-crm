import { Command } from "commander";
import { info, bold } from "../ui/colors.js";
import { signDashboardToken } from "../core/dashboard.js";
import { getActor } from "../fs/audit-log.js";

export const dashboardCommand = new Command("dashboard").description(
  "Read-only web dashboard (forecast, funnel, velocity, goals)"
);

dashboardCommand
  .command("link")
  .description("Mint a token-secured dashboard link for the current actor")
  .option("--days <n>", "Link validity in days", "7")
  .action((opts: { days: string }) => {
    const days = Math.max(1, parseInt(opts.days, 10) || 7);
    const actor = getActor();
    const token = signDashboardToken({ a: actor, exp: Date.now() + days * 86_400_000 });
    const base = (process.env["DXCRM_SERVER_URL"] ?? "http://localhost:3847").replace(/\/+$/, "");
    console.log(bold(`${base}/dashboard?token=${token}`));
    console.log(
      info(`actor=${actor} · valid ${days} day(s) · requires the HTTP server (dxcrm server start)`)
    );
  });
