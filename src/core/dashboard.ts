import fs from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { buildSimulationInput, runSimulation } from "./revenue-simulation.js";
import { analyzeFunnel } from "./funnel.js";
import { analyzeVelocity } from "./velocity.js";
import { readGoals, type Goal } from "./goal-engine.js";
import { getRole, type Role } from "./rbac.js";
import { listCustomerSlugs } from "../fs/customer-dir.js";
import { customerVisibility } from "./rbac.js";

/**
 * Read-only web dashboard (#52): server-rendered HTML out of local snapshots
 * and existing analytics — no SPA, no external cloud, charts as inline SVG.
 * Access is token-secured (HMAC + expiry) and RBAC-aware: a rep's forecast is
 * scoped to their own customers, and global tiles (funnel/velocity/goals) are
 * manager/admin only.
 */

function secret(env: NodeJS.ProcessEnv = process.env): string {
  return env["DXCRM_DASHBOARD_SECRET"] ?? "dxcrm-dashboard-default-secret";
}

export interface DashboardTokenPayload {
  a: string; // actor
  exp: number; // epoch ms
}

export function signDashboardToken(
  payload: DashboardTokenPayload,
  env: NodeJS.ProcessEnv = process.env
): string {
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  return `${body}.${sig}`;
}

export function verifyDashboardToken(
  token: string,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env
): DashboardTokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf-8")
    ) as DashboardTokenPayload;
    if (!parsed.a || typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface DashboardData {
  actor: string;
  role: Role;
  generatedAt: string;
  forecast: {
    weightedTotal: number;
    p50: number;
    p90: number;
    dealCount: number;
    byPipeline: Record<string, number>;
    topRisks: string[];
  };
  customersVisible: number;
  /** Global tiles — only for manager/admin. */
  funnel?: { stages: Array<{ stage: string; reached: number }>; winRatePct: number | null };
  velocity?: {
    avgSalesCycleDays: number | null;
    stalledDeals: Array<{ slug: string; name: string; stage: string; daysInStage: number }>;
  };
  goals?: Array<Pick<Goal, "description" | "target" | "progress" | "deadline" | "status">>;
}

export async function buildDashboardData(dataDir: string, actor: string): Promise<DashboardData> {
  // Solo mode (no rbac.json) = open access — show every tile.
  const rbacConfigured = fs.existsSync(path.join(dataDir, ".agentic", "rbac.json"));
  const role: Role = rbacConfigured ? getRole(dataDir, actor) : "admin";
  const today = new Date().toISOString().slice(0, 10);

  // RBAC-scoped forecast: buildSimulationInput already filters by actor (#51).
  const simInput = await buildSimulationInput(dataDir, "90d", today, [], { actor });
  const sim = runSimulation({ ...simInput, iterations: 2000 });
  const byPipeline: Record<string, number> = {};
  let weightedTotal = 0;
  for (const d of simInput.deals) {
    const w = Math.round((d.value * d.probability) / 100);
    weightedTotal += w;
    // DealSnapshot has no pipeline; group via owner-neutral fallback is fine —
    // use the per-pipeline forecast for exact rollups. Here: bucket by stage.
    byPipeline[d.stage] = (byPipeline[d.stage] ?? 0) + w;
  }

  const canSee = customerVisibility(dataDir, actor);
  const customersVisible = listCustomerSlugs(dataDir).filter(canSee).length;

  const data: DashboardData = {
    actor,
    role,
    generatedAt: new Date().toISOString(),
    forecast: {
      weightedTotal,
      p50: sim.p50,
      p90: sim.p90,
      dealCount: simInput.deals.length,
      byPipeline,
      topRisks: sim.topRisks.slice(0, 5),
    },
    customersVisible,
  };

  if (role === "manager" || role === "admin") {
    const funnel = analyzeFunnel(dataDir);
    data.funnel = {
      stages: funnel.stages.map((s) => ({ stage: s.stage, reached: s.reached })),
      winRatePct: funnel.winRatePct,
    };
    const velocity = analyzeVelocity(dataDir);
    data.velocity = {
      avgSalesCycleDays: velocity.avgSalesCycleDays,
      stalledDeals: velocity.stalledDeals.slice(0, 5).map((d) => ({
        slug: d.slug,
        name: d.name,
        stage: d.stage,
        daysInStage: d.daysInStage,
      })),
    };
    data.goals = readGoals(dataDir).map((g) => ({
      description: g.description,
      target: g.target,
      progress: g.progress,
      deadline: g.deadline,
      status: g.status,
    }));
  }

  return data;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Simple horizontal SVG bar chart — zero dependencies. */
function barChart(rows: Array<{ label: string; value: number }>, color = "#3b82f6"): string {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const h = 26;
  const bars = rows
    .map((r, i) => {
      const w = Math.round((r.value / max) * 320);
      const y = i * (h + 6);
      return `<g><text x="0" y="${y + 17}" font-size="12" fill="#444">${esc(r.label)}</text>
<rect x="130" y="${y + 4}" width="${Math.max(w, 2)}" height="${h - 10}" rx="3" fill="${color}"/>
<text x="${136 + w}" y="${y + 17}" font-size="12" fill="#222">${r.value.toLocaleString()}</text></g>`;
    })
    .join("\n");
  return `<svg width="540" height="${rows.length * (h + 6) + 4}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

export function renderDashboardHtml(data: DashboardData): string {
  const f = data.forecast;
  const stageRows = Object.entries(f.byPipeline).map(([label, value]) => ({ label, value }));
  const funnelTile = data.funnel
    ? `<section><h2>Funnel</h2>${barChart(
        data.funnel.stages.map((s) => ({ label: s.stage, value: s.reached })),
        "#10b981"
      )}<p>Win rate: ${data.funnel.winRatePct !== null ? `${data.funnel.winRatePct}%` : "n/a"}</p></section>`
    : "";
  const velocityTile = data.velocity
    ? `<section><h2>Velocity</h2><p>Avg sales cycle: ${data.velocity.avgSalesCycleDays ?? "n/a"} days</p>
${
  data.velocity.stalledDeals.length > 0
    ? `<ul>${data.velocity.stalledDeals.map((d) => `<li>⚠ ${esc(d.slug)}/${esc(d.name)} — ${d.daysInStage}d in ${esc(d.stage)}</li>`).join("")}</ul>`
    : "<p>No stalled deals 🎉</p>"
}</section>`
    : "";
  const goalsTile = data.goals
    ? `<section><h2>Goals</h2>${
        data.goals.length === 0
          ? "<p>No active goals.</p>"
          : data.goals
              .map((g) => {
                const pct =
                  g.target > 0 ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
                return `<div class="goal"><strong>${esc(g.description)}</strong> — ${g.progress.toLocaleString()} / ${g.target.toLocaleString()} (${pct}%) · due ${esc(g.deadline)} · ${esc(g.status)}
<div class="bar"><div class="fill" style="width:${pct}%"></div></div></div>`;
              })
              .join("")
      }</section>`
    : "";
  const risksTile =
    f.topRisks.length > 0
      ? `<section><h2>Top risks</h2><ul>${f.topRisks.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></section>`
      : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>DatasynxOpenCRM — Dashboard</title>
<style>body{font-family:Arial,sans-serif;max-width:920px;margin:32px auto;color:#1a1a2e;padding:0 16px}
h1{margin-bottom:4px}.meta{color:#888;font-size:.9em}section{margin:28px 0;padding:18px;border:1px solid #e5e7eb;border-radius:8px}
.kpis{display:flex;gap:24px;flex-wrap:wrap}.kpi{min-width:150px}.kpi .v{font-size:1.7em;font-weight:bold}
.goal{margin:10px 0}.bar{background:#eee;border-radius:4px;height:10px;margin-top:4px}.fill{background:#3b82f6;height:10px;border-radius:4px}
ul{margin:6px 0;padding-left:20px}</style></head>
<body><h1>DatasynxOpenCRM Dashboard</h1>
<p class="meta">read-only · ${esc(data.actor)} (${esc(data.role)}) · ${esc(data.generatedAt.slice(0, 16).replace("T", " "))} · ${data.customersVisible} customer(s)</p>
<section><h2>Forecast (rolling 90d)</h2><div class="kpis">
<div class="kpi"><div class="v">€${f.weightedTotal.toLocaleString()}</div>weighted</div>
<div class="kpi"><div class="v">€${f.p50.toLocaleString()}</div>P50</div>
<div class="kpi"><div class="v">€${f.p90.toLocaleString()}</div>P90</div>
<div class="kpi"><div class="v">${f.dealCount}</div>open deals</div></div>
${stageRows.length > 0 ? barChart(stageRows) : "<p>No open deals.</p>"}</section>
${risksTile}
${funnelTile}
${velocityTile}
${goalsTile}
</body></html>`;
}
