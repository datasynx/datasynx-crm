# D13 — Autonomous Deal Agent: Implementierungsplan

> Basis: plan-next-dxc.md · D13 · Stand: 2026-05-27
> TDD-First. Kein Produktionscode ohne vorherigen Test.
> Baut auf D11 (graph.ts), D12 (relationship-health.ts), deal-health.ts, llm.ts auf.

---

## Was D13 liefert

Der erste vollständig agentenhafte Domino. Kein reaktives Tool mehr — der Deal Agent
**beobachtet**, **analysiert** und **handelt** selbstständig mit kontrollierbarer Autonomie.

Drei Modes:
- **`observe`** — analysiert, schreibt Trace, keine Side Effects
- **`suggest`** — generiert Plan + stellt Aktionen in Queue (Human Review required)
- **`act`** — führt Aktionen mit `confidence ≥ 0.7` und `value < valueThreshold` autonom aus

**User-sichtbare Änderungen:**
- Neues MCP-Tool `run_deal_agent` — analysiert einen Deal und gibt Plan + Actions zurück
- Neues MCP-Tool `approve_agent_action` — genehmigt/lehnt gequeuete Aktionen ab
- `customers/<slug>/agent-queue.json` — persistente Queue pending Actions (für D20)
- Glass-Box: jede Entscheidung ist im `trace` Feld inspektierbar

**Was D13 NICHT tut (v1-Grenzen, explizit):**
- Keine E-Mails versenden (kein SMTP-Connector in v1)
- Kein proaktiver Trigger (cron) — kommt in D20
- Keine Multi-Agent-Koordination — kommt in D19
- Keine Playbook-Integration — kommt in D15
- `valueThreshold` schützt: über diesem Deal-Wert keine Autoexecution ohne Approval

---

## Neue Dateien

```
src/agents/deal-agent.ts                   ← Core: Observation + LLM-Analyse + Execution
src/mcp/tools/run-deal-agent.ts            ← MCP-Tool: run_deal_agent
src/mcp/tools/approve-agent-action.ts      ← MCP-Tool: approve_agent_action

__tests__/agents/deal-agent.test.ts
__tests__/mcp/tools/run-deal-agent.test.ts
__tests__/mcp/tools/approve-agent-agent.test.ts
```

## Geänderte Dateien

```
src/mcp/server.ts        ← registerRunDealAgent() + registerApproveAgentAction()
src/mcp/capabilities.ts  ← run_deal_agent + approve_agent_action in CAPABILITIES_TEXT
README.md
docs/mcp-tools.md
docs/index.html
```

---

## Technische Recherche & Designentscheidungen

### Warum Dependency Injection statt `vi.mock()`?

Das Codebase-Pattern für LLM-abhängige Funktionen (`summarize-meeting.test.ts`) verwendet
Top-Level `vi.mock()`, das nicht mit `vi.resetModules()` + memfs kombiniert werden kann.

D13 löst das anders: **LLM als injizierbarer Parameter**:

```typescript
export async function runDealAgent(
  config: DealAgentConfig,
  dataDir: string,
  llmFn: (prompt: string) => Promise<string> = callLlm
): Promise<DealAgentResult>
```

Tests übergeben direkt eine Mock-Funktion:

```typescript
const mockLlm = async (_: string) => JSON.stringify({ assessment: "...", ... });
const result = await runDealAgent(config, DATA_DIR, mockLlm);
```

Vorteile:
- Keine `vi.mock()` Komplexität
- Kombinierbar mit memfs (`vi.resetModules()` + `vol.fromJSON`)
- Testbare LLM-Ausgaben ohne Anthropic API Key
- Gleicher Code, echte LLM-Funktion in Production

### Warum Rule-Based Fallback?

Wenn `ANTHROPIC_API_KEY` nicht gesetzt ist, soll `run_deal_agent` trotzdem funktionieren
(degraded mode). Die Fallback-Funktion `buildRuleBasedAnalysis()` generiert Plan + Actions
rein aus Observation-Daten (deal health score, risk flags, missing roles).

Das ermöglicht:
- Tests ohne API Key
- Offline-Nutzung
- Deterministisches Verhalten in CI

### agent-queue.json: Warum per Customer?

`customers/<slug>/agent-queue.json` — konsistent mit `graph.json` und `health.json`.
Vorteil: GDPR `erase` löscht automatisch alles durch rekursives `rmSync`.
D20 (Proactive Agent) liest diese Queue über alle Customers.

### Glass-Box Requirement

Jede Entscheidung des Agents muss inspektierbar sein. `DealAgentTrace` captured:
- Was wurde beobachtet (`observation`)
- Welche Aktionen wurden erwogen (`actionsConsidered`)
- Was wurde ausgeführt oder gequeuet
- Warum (`reasoning` pro Action)

Motivation: EU AI Act Art. 13 (Transparency), + User-Trust bei autonomen Aktionen.

### LLM-Modell

`claude-haiku-4-5-20251001` — gleich wie in `src/core/llm.ts`. Haiku ist schnell und
günstig für strukturierte Analyse. Output: max 800 Tokens (JSON).

---

## Datenmodell (exakt, TypeScript-ready)

### `src/agents/deal-agent.ts`

```typescript
export type AutonomyLevel = "observe" | "suggest" | "act";
export type ActionType   = "log_interaction" | "update_deal" | "alert" | "schedule_meeting";
export type ActionStatus = "pending" | "approved" | "executed" | "rejected" | "skipped";
export type RiskLevel    = "low" | "medium" | "high" | "critical";

export interface DealAgentConfig {
  slug: string;
  dealName: string;
  autonomyLevel: AutonomyLevel;
  instruction?: string;
  valueThreshold: number;  // EUR — über diesem Wert: kein auto-execute in "act" mode
  today: string;           // YYYY-MM-DD — injiziert für Testbarkeit
}

export interface DealAgentAction {
  actionId: string;
  type: ActionType;
  payload: Record<string, unknown>;
  confidence: number;              // 0.0–1.0
  reasoning: string;
  requiresHumanApproval: boolean;
  status: ActionStatus;
  createdAt: string;
}

export interface DealPlanStep {
  step: number;
  action: string;
  priority: "urgent" | "high" | "medium" | "low";
  reason: string;
}

export interface DealAgentTrace {
  timestamp: string;
  slug: string;
  dealName: string;
  autonomyLevel: AutonomyLevel;
  observation: string;             // komprimierte Beobachtungs-Summary
  plan: string[];                  // plan steps als String-Array
  actionsConsidered: DealAgentAction[];
  actionTaken: DealAgentAction | null;
  outcome: "queued" | "executed" | "observed" | "error";
}

export interface DealAgentResult {
  slug: string;
  dealName: string;
  assessment: string;
  riskLevel: RiskLevel;
  plan: DealPlanStep[];
  actionsQueued: DealAgentAction[];    // bei suggest/act mit requiresHumanApproval
  actionsExecuted: DealAgentAction[];  // nur bei "act" + confidence >= threshold
  trace: DealAgentTrace;
}

// Internes LLM Response-Schema
export interface LlmDealAnalysis {
  assessment: string;
  riskLevel: RiskLevel;
  plan: DealPlanStep[];
  actions: Array<{
    type: ActionType;
    payload: Record<string, unknown>;
    confidence: number;
    reasoning: string;
  }>;
}

// Observation Layer — reine Datensammlung, kein LLM
export interface DealObservation {
  deal: import("../schemas/pipeline.js").PipelineDeal;
  daysSinceLastActivity: number;
  daysInCurrentStage: number;
  daysToClose: number | undefined;
  dealHealthScore: import("../core/deal-health.js").DealHealthScore;
  overallRelationshipHealth: number;
  atRiskContacts: string[];
  coldContacts: string[];
  missingRoles: Array<{ role: string; urgency: string }>;
  championCount: number;
  recentInteractionsSummary: string;  // letzten 3 Interaction-Blöcke
  contextSummary: string;             // komprimierter String für LLM-Prompt
}

// agent-queue.json
export interface AgentQueue {
  schemaVersion: "1";
  slug: string;
  pendingActions: DealAgentAction[];
  updatedAt: string;
}
```

### `agent-queue.json` — Beispiel

```json
{
  "schemaVersion": "1",
  "slug": "acme-corp",
  "pendingActions": [
    {
      "actionId": "da_1748346900000_a3f7x2",
      "type": "log_interaction",
      "payload": {
        "slug": "acme-corp",
        "type": "Note",
        "summary": "Deal agent scheduled follow-up with Max Müller re: stalled negotiation.",
        "with": "Max Müller"
      },
      "confidence": 0.85,
      "reasoning": "Max Müller is the champion and hasn't been contacted in 18 days.",
      "requiresHumanApproval": true,
      "status": "pending",
      "createdAt": "2026-05-27T14:00:00.000Z"
    }
  ],
  "updatedAt": "2026-05-27T14:00:00.000Z"
}
```

---

## Datei 1: `src/agents/deal-agent.ts` — vollständige API

### Imports

```typescript
import fs from "fs";
import path from "path";
import { readPipeline } from "../fs/pipeline-writer.js";
import { scoreDeal } from "../core/deal-health.js";
import { computeCustomerHealth } from "../core/relationship-health.js";
import { readGraph, getStakeholders } from "../core/graph.js";
import { callLlm } from "../core/llm.js";
import type { PipelineDeal } from "../schemas/pipeline.js";
```

### Dateipfade

```typescript
export function agentQueuePath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "agent-queue.json");
}
```

### Agent-Queue lesen / schreiben

```typescript
export function readAgentQueue(dataDir: string, slug: string): AgentQueue {
  const p = agentQueuePath(dataDir, slug);
  if (!fs.existsSync(p)) {
    return { schemaVersion: "1", slug, pendingActions: [], updatedAt: new Date().toISOString() };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as AgentQueue;
  } catch {
    return { schemaVersion: "1", slug, pendingActions: [], updatedAt: new Date().toISOString() };
  }
}

export function writeAgentQueue(dataDir: string, slug: string, queue: AgentQueue): void {
  const p = agentQueuePath(dataDir, slug);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const updated: AgentQueue = { ...queue, updatedAt: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(updated, null, 2), "utf-8");
}
```

### Action-ID generieren

```typescript
export function makeActionId(): string {
  return `da_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
```

In Tests nicht direkt verglichen — nur `typeof id === "string"` und `id.startsWith("da_")`.

### Observation Layer (async, kein LLM)

```typescript
export async function observeDeal(
  dataDir: string,
  slug: string,
  dealName: string,
  today: string
): Promise<DealObservation | null> {
  // Pipeline lesen
  const deals = await readPipeline(dataDir, slug).catch(() => [] as PipelineDeal[]);
  const deal = deals.find(
    (d) => d.name.toLowerCase() === dealName.toLowerCase()
  );
  if (!deal) return null;

  const todayDate = new Date(today);
  const updatedDate = deal.updated ? new Date(deal.updated) : todayDate;
  const daysSinceLastActivity = Math.floor(
    (todayDate.getTime() - updatedDate.getTime()) / 86_400_000
  );
  const daysInCurrentStage = daysSinceLastActivity;
  const daysToClose = deal.close_date
    ? Math.floor((new Date(deal.close_date).getTime() - todayDate.getTime()) / 86_400_000)
    : undefined;

  const dealHealthScore = scoreDeal(deal, {
    daysSinceLastActivity,
    daysInCurrentStage,
    ...(daysToClose !== undefined ? { daysToClose } : {}),
    ...(deal.probability !== undefined ? { probability: deal.probability } : {}),
  });

  // Relationship Health
  const health = computeCustomerHealth(dataDir, slug, today);
  const atRiskContacts = health.contacts
    .filter((c) => c.riskFlags.length > 0)
    .map((c) => c.email ?? c.contactId);
  const coldContacts = health.contacts
    .filter((c) => c.trend === "cold")
    .map((c) => c.email ?? c.contactId);

  // Graph: Stakeholder-Gaps
  const graph = readGraph(dataDir, slug);
  const stakeholders = getStakeholders(graph);
  const missingRoles = stakeholders.missingRoles.map((r) => ({
    role: r.role,
    urgency: r.urgency,
  }));
  const championCount = stakeholders.champions.length;

  // Recent interactions (letzte 3 Blöcke aus interactions.md)
  const interactionsPath = path.join(dataDir, "customers", slug, "interactions.md");
  const recentInteractionsSummary = buildRecentInteractionsSummary(interactionsPath);

  // Context Summary für LLM-Prompt
  const contextSummary = buildContextSummary({
    deal,
    daysSinceLastActivity,
    daysInCurrentStage,
    daysToClose,
    dealHealthScore,
    health,
    atRiskContacts,
    coldContacts,
    missingRoles,
    championCount,
    recentInteractionsSummary,
  });

  return {
    deal,
    daysSinceLastActivity,
    daysInCurrentStage,
    daysToClose,
    dealHealthScore,
    overallRelationshipHealth: health.overallHealth,
    atRiskContacts,
    coldContacts,
    missingRoles,
    championCount,
    recentInteractionsSummary,
    contextSummary,
  };
}
```

**Hilfsfunktionen:**

```typescript
function buildRecentInteractionsSummary(interactionsPath: string): string {
  if (!fs.existsSync(interactionsPath)) return "(no interactions)";
  const content = fs.readFileSync(interactionsPath, "utf-8") as string;
  const blocks = content
    .split(/(?=^## \d{4}-\d{2}-\d{2})/m)
    .filter((b) => b.trim().length > 0)
    .slice(0, 3);
  return blocks
    .map((b) => {
      const dateMatch = b.match(/^## (\d{4}-\d{2}-\d{2}) · (\w+)/m);
      const summaryMatch = b.match(/^\*\*Summary:\*\*\s*(.+)$/m);
      if (!dateMatch || !summaryMatch) return "";
      return `[${dateMatch[1]}/${dateMatch[2]}] ${summaryMatch[1]!.trim()}`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildContextSummary(data: {
  deal: PipelineDeal;
  daysSinceLastActivity: number;
  daysInCurrentStage: number;
  daysToClose: number | undefined;
  dealHealthScore: import("../core/deal-health.js").DealHealthScore;
  health: import("../core/relationship-health.js").HealthSnapshot;
  atRiskContacts: string[];
  coldContacts: string[];
  missingRoles: Array<{ role: string; urgency: string }>;
  championCount: number;
  recentInteractionsSummary: string;
}): string {
  const lines: string[] = [
    `Deal: ${data.deal.name} | Stage: ${data.deal.stage} | Value: €${data.deal.value ?? "?"} | Close: ${data.deal.close_date ?? "not set"}`,
    `Days since activity: ${data.daysSinceLastActivity} | Days to close: ${data.daysToClose ?? "?"}`,
    `Deal health: grade ${data.dealHealthScore.grade} (score ${data.dealHealthScore.score})`,
    `Warnings: ${data.dealHealthScore.warnings.join("; ") || "none"}`,
    ``,
    `Relationship health: ${data.health.overallHealth}/100`,
    `At-risk contacts: ${data.atRiskContacts.join(", ") || "none"}`,
    `Cold contacts: ${data.coldContacts.join(", ") || "none"}`,
    `Missing stakeholder roles: ${data.missingRoles.map((r) => r.role).join(", ") || "none"}`,
    `Champions identified: ${data.championCount}`,
    ``,
    `Recent interactions:`,
    data.recentInteractionsSummary || "(none)",
  ];
  return lines.join("\n");
}
```

### LLM-Prompt bauen

```typescript
export function buildLlmPrompt(obs: DealObservation, config: DealAgentConfig): string {
  const instruction = config.instruction ?? "Analyze this deal and recommend next actions.";
  return `You are a CRM deal agent. Analyze the deal situation and return an action plan.
Return ONLY valid JSON — no markdown, no explanation.

${obs.contextSummary}

Instruction: ${instruction}

Respond with JSON matching exactly:
{
  "assessment": "<2-3 sentence situation assessment>",
  "riskLevel": "low" | "medium" | "high" | "critical",
  "plan": [
    { "step": 1, "action": "<what to do>", "priority": "urgent" | "high" | "medium" | "low", "reason": "<why>" }
  ],
  "actions": [
    {
      "type": "log_interaction" | "update_deal" | "alert" | "schedule_meeting",
      "payload": { /* tool-specific fields */ },
      "confidence": 0.0-1.0,
      "reasoning": "<why this action>"
    }
  ]
}

Payload schema per type:
- log_interaction: { slug, type: "Note"|"Call"|"Meeting", summary, with }
- update_deal: { slug, dealName, stage?, probability?, closeDate?, notes? }
- alert: { slug, message, urgency: "critical"|"high"|"medium" }
- schedule_meeting: { slug, with, notes }`;
}
```

### LLM-Antwort parsen (mit Fallback)

```typescript
export function parseLlmResponse(response: string): LlmDealAnalysis | null {
  try {
    // Strip possible markdown code fences
    const cleaned = response.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<LlmDealAnalysis>;
    if (!parsed.assessment || !parsed.riskLevel || !Array.isArray(parsed.plan)) {
      return null;
    }
    return {
      assessment: String(parsed.assessment),
      riskLevel: parsed.riskLevel,
      plan: Array.isArray(parsed.plan) ? parsed.plan : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    };
  } catch {
    return null;
  }
}
```

### Rule-Based Fallback (kein LLM)

```typescript
export function buildRuleBasedAnalysis(
  obs: DealObservation,
  config: DealAgentConfig
): LlmDealAnalysis {
  const plan: DealPlanStep[] = [];
  const actions: LlmDealAnalysis["actions"] = [];
  let riskLevel: RiskLevel = "low";

  // Risk assessment
  if (obs.dealHealthScore.grade === "F" || obs.coldContacts.length > 0) riskLevel = "critical";
  else if (obs.dealHealthScore.grade === "D" || obs.atRiskContacts.length > 0) riskLevel = "high";
  else if (obs.dealHealthScore.grade === "C") riskLevel = "medium";

  // Plan steps
  let step = 1;
  if (obs.coldContacts.length > 0) {
    plan.push({ step: step++, action: `Re-engage cold contacts: ${obs.coldContacts.join(", ")}`, priority: "urgent", reason: "No contact in 30+ days" });
    actions.push({ type: "alert", payload: { slug: config.slug, message: `Cold contacts: ${obs.coldContacts.join(", ")}`, urgency: "critical" }, confidence: 0.95, reasoning: "No contact in 30+ days" });
  }
  if (obs.atRiskContacts.length > 0) {
    plan.push({ step: step++, action: `Schedule call with at-risk contacts`, priority: "high", reason: "14+ days without contact" });
    actions.push({ type: "schedule_meeting", payload: { slug: config.slug, with: obs.atRiskContacts[0] ?? "", notes: "Scheduled by deal agent — relationship at risk" }, confidence: 0.8, reasoning: "At-risk contact identified" });
  }
  if (obs.missingRoles.some((r) => r.role === "economic_buyer")) {
    plan.push({ step: step++, action: "Identify economic buyer", priority: "high", reason: "No budget owner identified" });
  }
  if (obs.daysToClose !== undefined && obs.daysToClose < 14 && obs.dealHealthScore.grade !== "A") {
    plan.push({ step: step++, action: "Update deal close date or probability", priority: "urgent", reason: `Close date in ${obs.daysToClose} days, deal at grade ${obs.dealHealthScore.grade}` });
    actions.push({ type: "update_deal", payload: { slug: config.slug, dealName: config.dealName, notes: `Reviewed by deal agent — ${obs.daysToClose}d to close` }, confidence: 0.75, reasoning: "Close date imminent" });
  }
  if (plan.length === 0) {
    plan.push({ step: 1, action: "Maintain current cadence", priority: "low", reason: "Deal healthy" });
  }

  const assessment = `Deal "${config.dealName}" in stage "${obs.deal.stage}" — health grade ${obs.dealHealthScore.grade} (${obs.dealHealthScore.score}/100). Risk: ${riskLevel}.`;
  return { assessment, riskLevel, plan, actions };
}
```

### Action-Selektion (pure)

```typescript
export function selectActions(
  analysis: LlmDealAnalysis,
  obs: DealObservation,
  config: DealAgentConfig
): DealAgentAction[] {
  return analysis.actions.map((a) => {
    const dealValue = obs.deal.value ?? 0;
    const autoExecutable =
      config.autonomyLevel === "act" &&
      a.confidence >= 0.7 &&
      dealValue < config.valueThreshold;

    return {
      actionId: makeActionId(),
      type: a.type,
      payload: a.payload,
      confidence: a.confidence,
      reasoning: a.reasoning,
      requiresHumanApproval: !autoExecutable,
      status: "pending" as ActionStatus,
      createdAt: new Date().toISOString(),
    };
  });
}
```

### Action ausführen

```typescript
export async function executeAction(
  action: DealAgentAction,
  dataDir: string
): Promise<"executed" | "skipped"> {
  const slug = action.payload["slug"] as string | undefined;
  if (!slug) return "skipped";

  switch (action.type) {
    case "log_interaction": {
      const { appendInteraction } = await import("../fs/interactions-writer.js");
      const today = new Date().toISOString().slice(0, 10);
      await appendInteraction(dataDir, slug, {
        date: today,
        type: (action.payload["type"] as import("../schemas/interaction.js").InteractionEntry["type"]) ?? "Note",
        with: String(action.payload["with"] ?? "agent"),
        summary: String(action.payload["summary"] ?? ""),
        nextSteps: [],
        sourceRef: `agent://deal-agent/${action.actionId}`,
        synced: new Date().toISOString(),
      });
      return "executed";
    }

    case "schedule_meeting": {
      const { appendInteraction } = await import("../fs/interactions-writer.js");
      const today = new Date().toISOString().slice(0, 10);
      await appendInteraction(dataDir, slug, {
        date: today,
        type: "Note",
        with: String(action.payload["with"] ?? ""),
        summary: `[Agent scheduled] ${String(action.payload["notes"] ?? "Meeting scheduled by deal agent")}`,
        nextSteps: [`Schedule meeting with ${String(action.payload["with"] ?? "contact")}`],
        sourceRef: `agent://deal-agent/${action.actionId}`,
        synced: new Date().toISOString(),
      });
      return "executed";
    }

    case "update_deal": {
      const { handleUpdateDeal } = await import("../mcp/tools/update-deal.js");
      const payload = action.payload as {
        slug: string;
        dealName: string;
        stage?: string;
        value?: number;
        probability?: number;
        closeDate?: string;
        notes?: string;
      };
      await handleUpdateDeal(
        {
          slug: payload.slug,
          dealName: payload.dealName,
          ...(payload.stage !== undefined ? { stage: payload.stage as never } : {}),
          ...(payload.value !== undefined ? { value: payload.value } : {}),
          ...(payload.probability !== undefined ? { probability: payload.probability } : {}),
          ...(payload.closeDate !== undefined ? { closeDate: payload.closeDate } : {}),
          ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        },
        dataDir
      );
      return "executed";
    }

    case "alert": {
      // Write to agent-queue for D20 Proactive Agent pickup
      const queue = readAgentQueue(dataDir, slug);
      const alertAction: DealAgentAction = { ...action, status: "pending" };
      if (!queue.pendingActions.find((a) => a.actionId === action.actionId)) {
        queue.pendingActions.push(alertAction);
        writeAgentQueue(dataDir, slug, queue);
      }
      return "executed";
    }
  }
}
```

### Haupt-Funktion: runDealAgent

```typescript
export async function runDealAgent(
  config: DealAgentConfig,
  dataDir: string,
  llmFn: (prompt: string) => Promise<string> = callLlm
): Promise<DealAgentResult> {
  const timestamp = new Date().toISOString();

  // Observation
  const obs = await observeDeal(dataDir, config.slug, config.dealName, config.today);
  if (!obs) {
    throw new Error(`Deal "${config.dealName}" not found for customer "${config.slug}"`);
  }

  // LLM Analyse (mit Fallback)
  let analysis: LlmDealAnalysis;
  try {
    const prompt = buildLlmPrompt(obs, config);
    const rawResponse = await llmFn(prompt);
    analysis = parseLlmResponse(rawResponse) ?? buildRuleBasedAnalysis(obs, config);
  } catch {
    analysis = buildRuleBasedAnalysis(obs, config);
  }

  // Actions selektieren
  const allActions = selectActions(analysis, obs, config);

  const actionsQueued: DealAgentAction[] = [];
  const actionsExecuted: DealAgentAction[] = [];

  if (config.autonomyLevel === "observe") {
    // Keine Side Effects
  } else if (config.autonomyLevel === "suggest") {
    // Alle Actions queuen (Human Review)
    if (allActions.length > 0) {
      const queue = readAgentQueue(dataDir, config.slug);
      for (const action of allActions) {
        queue.pendingActions.push({ ...action, requiresHumanApproval: true });
        actionsQueued.push(action);
      }
      writeAgentQueue(dataDir, config.slug, queue);
    }
  } else {
    // "act" mode: auto-execute wenn confidence >= 0.7 und value < threshold
    const queue = readAgentQueue(dataDir, config.slug);
    let queueDirty = false;
    for (const action of allActions) {
      if (!action.requiresHumanApproval) {
        const outcome = await executeAction(action, dataDir).catch(() => "skipped" as const);
        actionsExecuted.push({ ...action, status: outcome === "executed" ? "executed" : "skipped" });
      } else {
        queue.pendingActions.push(action);
        actionsQueued.push(action);
        queueDirty = true;
      }
    }
    if (queueDirty) writeAgentQueue(dataDir, config.slug, queue);
  }

  const trace: DealAgentTrace = {
    timestamp,
    slug: config.slug,
    dealName: config.dealName,
    autonomyLevel: config.autonomyLevel,
    observation: obs.contextSummary,
    plan: analysis.plan.map((s) => `${s.step}. ${s.action} [${s.priority}]`),
    actionsConsidered: allActions,
    actionTaken: actionsExecuted[0] ?? null,
    outcome:
      actionsExecuted.length > 0
        ? "executed"
        : actionsQueued.length > 0
          ? "queued"
          : "observed",
  };

  return {
    slug: config.slug,
    dealName: config.dealName,
    assessment: analysis.assessment,
    riskLevel: analysis.riskLevel,
    plan: analysis.plan,
    actionsQueued,
    actionsExecuted,
    trace,
  };
}
```

---

## Datei 2: `src/mcp/tools/run-deal-agent.ts`

```typescript
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runDealAgent } from "../../agents/deal-agent.js";

const DATA_DIR = process.cwd();

export async function handleRunDealAgent(
  input: {
    slug: string;
    dealName: string;
    autonomyLevel?: "observe" | "suggest" | "act";
    instruction?: string;
    valueThreshold?: number;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await runDealAgent(
      {
        slug: input.slug,
        dealName: input.dealName,
        autonomyLevel: input.autonomyLevel ?? "suggest",
        instruction: input.instruction,
        valueThreshold: input.valueThreshold ?? 50_000,
        today,
      },
      dataDir
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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

export function registerRunDealAgent(server: McpServer): void {
  server.registerTool(
    "run_deal_agent",
    {
      title: "Run Deal Agent",
      description: `Analyzes a specific deal and generates a prioritized action plan.

Three autonomy levels:
- observe: analyze and return plan, no side effects
- suggest (default): queue actions for human review in agent-queue.json
- act: auto-execute actions with confidence ≥ 0.7 and value < valueThreshold

Each action includes confidence score and reasoning (glass-box).
Returns full trace for inspection.

Args:
  slug: Customer slug
  dealName: Exact deal name
  autonomyLevel: "observe" | "suggest" | "act" (default: "suggest")
  instruction: Optional context/question for the agent
  valueThreshold: EUR value above which no auto-execution (default: 50000)

Returns: { assessment, riskLevel, plan[], actionsQueued[], actionsExecuted[], trace }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        dealName: z.string().describe("Exact deal name"),
        autonomyLevel: z
          .enum(["observe", "suggest", "act"])
          .optional()
          .describe("Autonomy level (default: suggest)"),
        instruction: z.string().optional().describe("Optional instruction for the agent"),
        valueThreshold: z
          .number()
          .optional()
          .describe("EUR value above which no auto-execution (default: 50000)"),
      }),
    },
    async ({ slug, dealName, autonomyLevel, instruction, valueThreshold }) =>
      handleRunDealAgent({ slug, dealName, autonomyLevel, instruction, valueThreshold })
  );
}
```

---

## Datei 3: `src/mcp/tools/approve-agent-action.ts`

```typescript
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readAgentQueue, writeAgentQueue, executeAction } from "../../agents/deal-agent.js";

const DATA_DIR = process.cwd();

export async function handleApproveAgentAction(
  input: { slug: string; actionId: string; approved: boolean },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const queue = readAgentQueue(dataDir, input.slug);
    const idx = queue.pendingActions.findIndex((a) => a.actionId === input.actionId);

    if (idx === -1) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: `Action ${input.actionId} not found in queue` }, null, 2),
        }],
      };
    }

    const action = queue.pendingActions[idx]!;

    if (!input.approved) {
      queue.pendingActions[idx] = { ...action, status: "rejected" };
      writeAgentQueue(dataDir, input.slug, queue);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, actionId: input.actionId, status: "rejected" }, null, 2),
        }],
      };
    }

    // Execute
    const outcome = await executeAction(action, dataDir);
    queue.pendingActions[idx] = { ...action, status: outcome === "executed" ? "executed" : "skipped" };
    writeAgentQueue(dataDir, input.slug, queue);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, actionId: input.actionId, status: queue.pendingActions[idx]!.status }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
      }],
    };
  }
}

export function registerApproveAgentAction(server: McpServer): void {
  server.registerTool(
    "approve_agent_action",
    {
      title: "Approve Agent Action",
      description: `Approve or reject a pending action from the deal agent queue.

Find actionId in the actionsQueued array returned by run_deal_agent.

Args:
  slug: Customer slug
  actionId: Action ID from the agent queue
  approved: true to execute, false to reject

Returns: { success, actionId, status }`,
      inputSchema: z.object({
        slug: z.string(),
        actionId: z.string(),
        approved: z.boolean(),
      }),
    },
    async ({ slug, actionId, approved }) =>
      handleApproveAgentAction({ slug, actionId, approved })
  );
}
```

---

## Integration: `src/mcp/server.ts`

```typescript
// Imports hinzufügen:
import { registerRunDealAgent } from "./tools/run-deal-agent.js";
import { registerApproveAgentAction } from "./tools/approve-agent-action.js";

// In createMcpServer() — 18 tools:
registerRunDealAgent(server);
registerApproveAgentAction(server);
```

---

## Integration: `src/mcp/capabilities.ts`

Neue Zeilen in der Tool-Tabelle:

```
| run_deal_agent | Analyze deal + generate action plan (observe/suggest/act) | rep+ |
| approve_agent_action | Approve/reject queued agent action | rep+ |
```

Neue Referenz-Blöcke:

```
### run_deal_agent({ slug, dealName, autonomyLevel?, instruction?, valueThreshold? })
Analyzes deal situation (health, relationships, stakeholder gaps) via LLM.
Returns prioritized action plan with confidence scores and full reasoning trace.
autonomyLevel: "observe" (read-only) | "suggest" (queue) | "act" (auto-execute)
- Returns: { assessment, riskLevel, plan[], actionsQueued[], actionsExecuted[], trace }

### approve_agent_action({ slug, actionId, approved })
Execute (approved=true) or reject (approved=false) a pending deal agent action.
Find actionId in run_deal_agent response.actionsQueued[].actionId
- Returns: { success, actionId, status }
```

---

## TDD — Test-Spezifikationen

### `__tests__/agents/deal-agent.test.ts`

**Muster:** `vi.resetModules()` + `vol.fromJSON()` + dynamic import. LLM als Parameter injiziert (kein `vi.mock`).

#### agentQueuePath

```
✓ returns correct path under customers/<slug>/agent-queue.json
```

#### readAgentQueue / writeAgentQueue

```
✓ returns empty queue when agent-queue.json does not exist
✓ written queue is readable via memfs
✓ updatedAt is refreshed on write
✓ returns empty queue on corrupted JSON (graceful)
✓ pendingActions preserved across write/read roundtrip
```

#### makeActionId

```
✓ returns string starting with "da_"
✓ two calls produce different IDs
```

#### parseLlmResponse

```
✓ parses valid JSON response correctly
✓ returns null for invalid JSON
✓ returns null for JSON missing required fields (assessment, riskLevel, plan)
✓ strips markdown code fences before parsing (```json ... ```)
✓ handles empty actions array
```

#### buildLlmPrompt

```
✓ includes dealName in prompt
✓ includes contextSummary in prompt
✓ includes instruction when provided
✓ includes default instruction when no instruction given
✓ includes JSON schema hint
```

#### buildRuleBasedAnalysis

```
✓ returns "critical" riskLevel for grade-F deal
✓ returns "high" riskLevel when cold contacts exist
✓ returns "low" riskLevel for healthy deal (no flags)
✓ includes re-engage step when cold contacts exist
✓ includes schedule_meeting action when at-risk contacts exist
✓ includes economic_buyer step when missing role
✓ returns at least one plan step always
✓ assessment contains deal name and grade
```

#### selectActions (pure)

```
✓ sets requiresHumanApproval=false when autonomyLevel=act + confidence>=0.7 + value<threshold
✓ sets requiresHumanApproval=true when autonomyLevel=suggest (always)
✓ sets requiresHumanApproval=true when autonomyLevel=act + confidence<0.7
✓ sets requiresHumanApproval=true when autonomyLevel=act + deal value>=threshold
✓ sets requiresHumanApproval=true when autonomyLevel=observe (always)
✓ each action gets a unique actionId
✓ each action has status="pending"
```

#### observeDeal (integration, memfs)

```
✓ returns null when deal not found in pipeline.md
✓ returns DealObservation when deal exists
✓ daysSinceLastActivity correct for given today
✓ daysToClose correct when close_date set
✓ daysToClose undefined when no close_date
✓ atRiskContacts populated from relationship health
✓ missingRoles populated from graph stakeholders
✓ recentInteractionsSummary empty string when no interactions.md
✓ recentInteractionsSummary contains last 3 interactions
✓ handles missing graph.json gracefully (no champion flags)
✓ handles missing health (no errors)
```

#### runDealAgent — observe mode

```
✓ returns assessment and riskLevel
✓ plan has at least one step
✓ actionsQueued is empty (observe mode — no side effects)
✓ actionsExecuted is empty
✓ trace.outcome is "observed"
✓ no agent-queue.json written
```

#### runDealAgent — suggest mode

```
✓ actionsQueued contains actions from LLM response
✓ all queued actions have requiresHumanApproval=true
✓ agent-queue.json is written with pending actions
✓ actionsExecuted is empty
✓ trace.outcome is "queued"
```

#### runDealAgent — act mode (high confidence, low value)

```
✓ executes actions with confidence>=0.7 + value<threshold
✓ actionsExecuted has executed actions
✓ trace.outcome is "executed"
✓ high-confidence actions NOT in actionsQueued
```

#### runDealAgent — act mode (low confidence → queue)

```
✓ low-confidence actions go to queue not execution
✓ actionsQueued contains low-confidence actions
```

#### runDealAgent — LLM fallback

```
✓ uses rule-based analysis when LLM throws error
✓ still returns valid DealAgentResult on LLM failure
✓ riskLevel is set from rule-based analysis
```

#### runDealAgent — deal not found

```
✓ throws Error when dealName not found in pipeline
```

### `__tests__/mcp/tools/run-deal-agent.test.ts`

```
✓ returns assessment in response
✓ defaults to autonomyLevel=suggest
✓ passes instruction to agent
✓ returns success:false when deal not found
✓ returns success:false on unexpected error (null dataDir)
✓ registers tool with name run_deal_agent
```

### `__tests__/mcp/tools/approve-agent-action.test.ts`

```
✓ returns error when actionId not found in queue
✓ sets status=rejected when approved=false
✓ executes action and sets status=executed when approved=true
✓ does not re-execute already executed action
✓ registers tool with name approve_agent_action
```

---

## Implementierungsreihenfolge (9 Schritte)

```
Schritt 1: Tests schreiben
  → __tests__/agents/deal-agent.test.ts              (alle rot)
  → __tests__/mcp/tools/run-deal-agent.test.ts       (alle rot)
  → __tests__/mcp/tools/approve-agent-action.test.ts (alle rot)

Schritt 2: Datentypen + Dateipfade + Queue read/write
  → src/agents/deal-agent.ts
  → Typen, agentQueuePath, readAgentQueue, writeAgentQueue, makeActionId
  → npm test → Queue-Tests grün

Schritt 3: Pure Hilfsfunktionen
  → parseLlmResponse, buildLlmPrompt, buildRuleBasedAnalysis, selectActions
  → npm test → Parser + Rule-Based-Tests grün

Schritt 4: Observation Layer
  → observeDeal + buildRecentInteractionsSummary + buildContextSummary
  → npm test → observeDeal-Tests grün

Schritt 5: executeAction
  → alle 4 action types implementieren
  → npm test → executeAction-Tests grün

Schritt 6: runDealAgent (Haupt-Funktion)
  → alle 3 autonomy levels
  → npm test → runDealAgent-Tests grün
  → npm test __tests__/agents/deal-agent.test.ts → alle grün

Schritt 7: MCP-Tools
  → src/mcp/tools/run-deal-agent.ts
  → src/mcp/tools/approve-agent-action.ts
  → npm test __tests__/mcp/tools/run-deal-agent.test.ts → grün
  → npm test __tests__/mcp/tools/approve-agent-action.test.ts → grün

Schritt 8: Integration
  → src/mcp/server.ts — registerRunDealAgent + registerApproveAgentAction (18 tools)
  → src/mcp/capabilities.ts — Tabelle + Referenz-Blöcke

Schritt 9: Full-Suite + Docs + Commit
  → npm test → alle Tests grün
  → npm run build → kein Fehler
  → npm run typecheck → kein Fehler
  → README.md, docs/mcp-tools.md, docs/index.html
  → git commit + git push
```

---

## Wichtige Implementierungsdetails (Fallstricke)

### `exactOptionalPropertyTypes` in DealObservation

`daysToClose` ist optional. Nicht so schreiben:

```typescript
// FALSCH
const obs: DealObservation = { daysToClose: deal.close_date ? ... : undefined };
```

Stattdessen:

```typescript
const obs: DealObservation = { ... };
if (daysToClose !== undefined) obs.daysToClose = daysToClose;
// oder:
const obs: DealObservation = {
  ...(daysToClose !== undefined ? { daysToClose } : {}),
  ...
};
```

### `handleUpdateDeal` Payload-Typen

`handleUpdateDeal` hat strikte Typen für `stage`:

```typescript
stage?: "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost"
```

Wenn der LLM einen beliebigen Stage-String sendet, muss validiert werden:

```typescript
const VALID_STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;
const stage = VALID_STAGES.find((s) => s === payload.stage);
// Nur übergeben wenn gefunden
```

### Dynamic Import in `executeAction`

`executeAction` verwendet `await import(...)` für `appendInteraction` und `handleUpdateDeal`.
Das ist notwendig um Circular-Dependency-Probleme zu vermeiden (deal-agent → update-deal → ... → deal-agent).

In Tests: memfs mockt `fs` global, Dynamic Imports funktionieren normal da sie nach `vi.resetModules()` frisch geladen werden.

### LLM-Fehlerbehandlung

Der `callLlm`-Aufruf in `runDealAgent` ist in einem `try/catch` gewrapped. Bei jedem Fehler
(Network, Invalid JSON, Rate Limit) wird `buildRuleBasedAnalysis` aufgerufen — niemals wird
ein Fehler an den User propagiert wenn die Observation erfolgreich war.

Nur wenn `observeDeal` fehlschlägt (Deal nicht gefunden) wirft `runDealAgent` eine Exception.

### Test-Pattern für runDealAgent

**NICHT** `vi.mock("../../../src/core/llm.js")` verwenden — nicht kombinierbar mit `vi.resetModules()`.

**Stattdessen:** Mock-LLM direkt als Parameter:

```typescript
it("uses rule-based fallback when LLM throws", async () => {
  vol.fromJSON({ /* pipeline.md etc */ });
  vi.resetModules();
  const { runDealAgent } = await import("../../src/agents/deal-agent.js");
  const failingLlm = async () => { throw new Error("API Error"); };
  const result = await runDealAgent(config, DATA_DIR, failingLlm);
  expect(result.riskLevel).toBeDefined();
});
```

### MCP Tool Tests: `handleRunDealAgent`

Im MCP-Handler wird `runDealAgent` mit default `callLlm` aufgerufen — kein LLM-Parameter exposed.
Test-Trick: Pipeline.md fehlt → Deal not found → `success: false` response.
Oder: Pipeline.md vorhanden aber kein API Key → `callLlm` throws → Fallback → `success: true` mit rule-based analysis.

Da CI kein `ANTHROPIC_API_KEY` hat, muss der MCP-Handler immer graceful degraden.

### `src/agents/` — neues Verzeichnis

```bash
mkdir -p src/agents
mkdir -p __tests__/agents
```

Kein `index.ts` — direkte Imports via `../../agents/deal-agent.js`.

---

## Daten-Abhängigkeiten

```
pipeline.md    ─── readPipeline ──────────────────────────▶  observeDeal
interactions.md ─── readFileSync ─────────────────────────▶  ↑
graph.json      ─── readGraph + getStakeholders ──────────▶  ↑
health.json     ─── computeCustomerHealth ────────────────▶  ↑
                                                              ↓
                                                        buildLlmPrompt
                                                              ↓
                                                         callLlm (LLM)
                                                              ↓
                                                        parseLlmResponse
                                                              ↓ (fallback wenn null)
                                                      buildRuleBasedAnalysis
                                                              ↓
                                                        selectActions
                                                              ↓
                       observe ────────────────────▶  no side effects
                       suggest ────────────────────▶  agent-queue.json (pending)
                       act     ────────────────────▶  executeAction → interactions.md / pipeline.md
                                                              ↓
                                                    DealAgentResult + DealAgentTrace
```

---

## Test-Count Prognose

| Datei | Tests |
|---|---|
| `__tests__/agents/deal-agent.test.ts` | ~55 |
| `__tests__/mcp/tools/run-deal-agent.test.ts` | ~6 |
| `__tests__/mcp/tools/approve-agent-action.test.ts` | ~5 |
| **Gesamt neue Tests** | **~66** |
| Gesamt nach D13 | **~1010** |
