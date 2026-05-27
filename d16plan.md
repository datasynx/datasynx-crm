# D16 — Goal-Based Orchestration: Implementierungsplan

> Basis: plan-next-dxc.md · D16 · Stand: 2026-05-27
> TDD-First. Kein Produktionscode ohne vorherigen Test.
> Baut auf D14 (revenue-simulation.ts), D15 (playbooks.ts), D12 (relationship-health.ts) auf.

---

## Was D16 liefert

Der qualitative Sprung von *"Tool, das auf Anfrage antwortet"* zu *"System, das eigenständig Ziele verfolgt"*.

Bisher kann der Agent berechnen was das Pipeline wahrscheinlich einbringen wird (D14), und welche Playbooks für eine Situation passen (D15). D16 dreht das um: Der User gibt ein Ziel vor — "Close €500k this quarter" — und das System:

1. **Versteht** das Ziel (parst Betrag, Metrik, Deadline)
2. **Analysiert** den aktuellen Zustand (Pipeline P50 via D14)
3. **Berechnet den Gap** (Ziel minus aktueller Forecast)
4. **Dekomponiert** in priorisierte Sub-Goals pro Deal (rule-based + optionaler LLM-Pfad)
5. **Persistiert** das Goal in `.agentic/goals.json`
6. **Trackt** Fortschritt (manuell v1, automatisch in D20)

**User-sichtbare Änderungen:**
- 2 neue MCP-Tools: `pursue_goal`, `get_goal_status`
- Neue CLI-Commands: `dxcrm goal set/status/update/cancel`
- Neue Datei: `.agentic/goals.json`

**Was D16 NICHT tut (v1-Grenzen):**
- Kein automatisches Progress-Update wenn ein Deal gewonnen wird (D20)
- Keine proaktiven Alerts wenn Goal off-track ist (D20)
- Kein OR-Ziel-Typ (z.B. "€500k OR 5 new logos") — reines AND-Ziel
- Kein Cross-Customer-Playbook-Lookup in Sub-Goals (D19)
- Keine Goal-Templates / wiederverwendbare Goal-Definitionen

---

## Neue Dateien

```
src/core/goal-engine.ts                        ← Core: Typen, Persistenz, Dekomposition
src/mcp/tools/pursue-goal.ts                   ← MCP-Tool: pursue_goal
src/mcp/tools/get-goal-status.ts               ← MCP-Tool: get_goal_status
src/commands/goal.ts                           ← CLI: dxcrm goal set/status/update/cancel

__tests__/core/goal-engine.test.ts
__tests__/mcp/tools/pursue-goal.test.ts
__tests__/mcp/tools/get-goal-status.test.ts
```

## Geänderte Dateien

```
src/mcp/server.ts           ← +2 registerXxx() → 25 tools
src/mcp/capabilities.ts     ← +2 tools in CAPABILITIES_TEXT
src/cli.ts                  ← +1 goalCommand
src/core/rbac.ts            ← pursue_goal zu admin + manager ALLOWED_TOOLS
README.md
docs/mcp-tools.md
docs/index.html
```

---

## TypeScript-Typen (`src/core/goal-engine.ts`)

```typescript
export type GoalMetric = "revenue" | "deals_closed" | "meetings_booked" | "pipeline_created";
export type GoalType = "revenue" | "pipeline" | "relationship" | "churn_prevention";
export type GoalStatus = "active" | "completed" | "cancelled" | "blocked";

export interface GoalSubGoal {
  priority: number;           // 1 = höchste Priorität
  action: string;             // "Accelerate acme-corp/Enterprise License"
  slug: string;               // Customer slug für direkten Tool-Aufruf
  dealName?: string;
  why: string;                // "Highest value deal (€75k) in negotiation — health 42"
  nextStep: string;           // "Call Max Müller by 2026-05-30"
  targetDelta: number;        // Erwarteter Revenue-Beitrag in €
  playbookName?: string;      // D15: Matching Playbook wenn vorhanden
}

export interface GoalDecomposition {
  analysis: string;           // "Current weighted pipeline: €287k P50. Gap: €213k."
  currentPipeline: number;    // P50-Forecast-Wert in €
  gap: number;                // target - currentPipeline
  subGoals: GoalSubGoal[];
  probabilisticOutcome: string; // "P50 forecast after actions: €512k (target: €500k)"
  decomposedAt: string;       // ISO timestamp
}

export interface Goal {
  id: string;                 // "goal_<timestamp>_<6hex>"
  description: string;        // "Close €500k ARR this quarter"
  type: GoalType;
  target: number;             // 500000
  metric: GoalMetric;
  deadline: string;           // "2026-09-30"
  decomposition: GoalDecomposition;
  progress: number;           // 0–100 (manuell)
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  actor: string;
}

export interface GoalsStore {
  goals: Goal[];
  updatedAt: string;
}
```

---

## Funktion-Signaturen (`src/core/goal-engine.ts`)

### Persistenz

```typescript
export function goalsPath(dataDir: string): string
// → path.join(dataDir, ".agentic", "goals.json")

export function readGoals(dataDir: string): Goal[]
// Liest goals.json, gibt [] bei fehlender Datei oder Parse-Fehler zurück

export function writeGoals(dataDir: string, goals: Goal[]): void
// Schreibt .agentic/goals.json, erstellt Verzeichnis wenn nötig

export function makeGoalId(): string
// → "goal_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8)
```

### Parsing & Analyse

```typescript
export function parseTargetFromDescription(desc: string): number
// Extrahiert Betrag aus natürlicher Sprache:
// "Close €500k" → 500000
// "$2M ARR" → 2000000
// "€1.5 million" → 1500000
// Fallback: 0 wenn kein Betrag gefunden

export function inferGoalType(desc: string): GoalType
// Keywords → Typ:
// "close", "revenue", "ARR", "MRR" → "revenue"
// "pipeline", "prospect", "lead" → "pipeline"
// "relationship", "meeting", "call" → "relationship"
// "churn", "retain", "renewal" → "churn_prevention"
// default → "revenue"

export function inferMetric(type: GoalType): GoalMetric
// "revenue" → "revenue"
// "pipeline" → "pipeline_created"
// "relationship" → "meetings_booked"
// "churn_prevention" → "revenue"
```

### Dekomposition (rule-based, pure function)

```typescript
export interface DealSummary {
  slug: string;
  dealName: string;
  stage: string;
  value: number;
  probability: number;
  healthScore: number;
  daysSinceContact: number;
  championPresent: boolean;
}

export function rankDealsByLeverage(deals: DealSummary[]): DealSummary[]
// Sortiert nach: value × probability × (healthScore / 100) absteigend
// Filtert won/lost heraus

export function decomposeGoalRuleBased(
  deals: DealSummary[],
  target: number,
  currentP50: number,
  today: string
): GoalDecomposition
// 1. gap = target - currentP50
// 2. ranked = rankDealsByLeverage(deals)
// 3. Iteriert bis cumulative targetDelta >= gap (max 5 Sub-Goals)
// 4. Wenn keine Deals: Sub-Goal "Build pipeline" mit nextStep "Create new customers"
// 5. Setzt playbookName wenn deals[i] einen Match haben (getBestPlaybook hook)
```

### LLM-Pfad (mit Fallback)

```typescript
export function buildDecompositionPrompt(
  description: string,
  target: number,
  deadline: string,
  currentP50: number,
  deals: DealSummary[],
  today: string
): string
// Strukturierter Prompt mit Pipeline-Übersicht und JSON-Schema

export function parseLlmDecomposition(
  response: string,
  fallback: GoalDecomposition
): GoalDecomposition
// Extrahiert JSON aus LLM-Antwort
// Validiert: analysis, subGoals array mit slug + targetDelta
// Bei Parse-Fehler: gibt fallback zurück (nie null)
```

### Goal-Management

```typescript
export async function pursueGoal(
  dataDir: string,
  input: {
    description: string;
    deadline: string;
    context?: string;
  },
  options: {
    llmFn?: (prompt: string) => Promise<string>;
    buildInputFn?: typeof buildSimulationInput;  // Dependency Injection für Tests
    today?: string;
    actor?: string;
  } = {}
): Promise<Goal>
// 1. parseTargetFromDescription(input.description)
// 2. buildInputFn(dataDir) → deals (SimulationInput)
// 3. runSimulation(simulationInput) → p50
// 4. decomposeGoalRuleBased(deals, target, p50, today) → fallback decomposition
// 5. Falls llmFn vorhanden: buildDecompositionPrompt → llmFn → parseLlmDecomposition
// 6. makeGoalId() + schreibt Goal in goals.json

export function getActiveGoals(dataDir: string): Goal[]
// readGoals(dataDir).filter(g => g.status === "active")

export function updateGoalProgress(dataDir: string, goalId: string, progress: number): Goal | null
// Aktualisiert progress + updatedAt, gibt null wenn goalId nicht gefunden

export function cancelGoal(dataDir: string, goalId: string): Goal | null
// Setzt status = "cancelled", gibt null wenn goalId nicht gefunden
```

---

## MCP-Tool-Signaturen

### `pursue_goal` — RBAC: manager+

```typescript
// Input:
{
  goal: string;      // "Close €500k ARR this quarter"
  deadline: string;  // "2026-09-30"
  context?: string;  // "Focus on existing pipeline, no new prospecting"
}

// Output:
{
  goalId: "goal_1748697600000_a3f7x2",
  description: "Close €500k ARR this quarter",
  target: 500000,
  deadline: "2026-09-30",
  decomposition: {
    analysis: "Current weighted pipeline: €287k P50. Gap: €213k.",
    currentPipeline: 287000,
    gap: 213000,
    subGoals: [
      {
        priority: 1,
        action: "Accelerate acme-corp/Enterprise License",
        slug: "acme-corp",
        dealName: "Enterprise License",
        why: "Highest value deal (€75k) in negotiation — health 42/100",
        nextStep: "Call decision-maker by 2026-05-30",
        targetDelta: 75000,
        playbookName: "enterprise-renewal"  // wenn D15-Playbook matcht
      }
    ],
    probabilisticOutcome: "P50 forecast after recommended actions: ~€512k"
  }
}
```

### `get_goal_status` — RBAC: any

```typescript
// Input:
{
  goalId?: string;   // Optional: spezifisches Goal, default: alle aktiven
}

// Output:
{
  goals: [
    {
      id: "goal_1748697600000_a3f7x2",
      description: "Close €500k ARR this quarter",
      target: 500000,
      progress: 45,
      status: "active",
      deadline: "2026-09-30",
      daysRemaining: 125,
      subGoals: [...],  // Top-3 Sub-Goals
      createdAt: "2026-05-27T..."
    }
  ],
  activeCount: 1,
  completedCount: 0
}
```

---

## CLI-Commands (`src/commands/goal.ts`)

```bash
dxcrm goal set "Close €500k this quarter" --deadline 2026-09-30
# → calls pursue_goal, druckt goalId + Sub-Goal-Liste

dxcrm goal status
# → listet alle aktiven Goals mit Progress-Bar

dxcrm goal update <goalId> --progress 45
# → aktualisiert Progress-Prozentsatz

dxcrm goal cancel <goalId>
# → setzt Status auf "cancelled"
```

---

## RBAC-Änderungen (`src/core/rbac.ts`)

Aktuell:
```typescript
const ALLOWED_TOOLS: Record<Role, string[]> = {
  admin:   ["log_interaction", "update_deal", "update_customer_facts", "export_customer"],
  manager: ["log_interaction", "update_deal"],
  rep:     ["log_interaction", "update_deal"],
};
```

Nach D16:
```typescript
const ALLOWED_TOOLS: Record<Role, string[]> = {
  admin:   ["log_interaction", "update_deal", "update_customer_facts", "export_customer", "pursue_goal"],
  manager: ["log_interaction", "update_deal", "pursue_goal"],
  rep:     ["log_interaction", "update_deal"],
};
```

`get_goal_status` braucht kein RBAC (read-only, RBAC-Tabelle sagt "any").

---

## Datenstruktur

```
~/.dxcrm/.agentic/goals.json
{
  "goals": [
    {
      "id": "goal_1748697600000_a3f7x2",
      "description": "Close €500k ARR this quarter",
      "type": "revenue",
      "target": 500000,
      "metric": "revenue",
      "deadline": "2026-09-30",
      "decomposition": {
        "analysis": "...",
        "currentPipeline": 287000,
        "gap": 213000,
        "subGoals": [...],
        "probabilisticOutcome": "...",
        "decomposedAt": "2026-05-27T..."
      },
      "progress": 0,
      "status": "active",
      "createdAt": "2026-05-27T...",
      "updatedAt": "2026-05-27T...",
      "actor": "alice"
    }
  ],
  "updatedAt": "2026-05-27T..."
}
```

---

## Testplan

### `__tests__/core/goal-engine.test.ts` — ~30 Tests

**makeGoalId (2)**
- Format: starts with "goal_", enthält nur alphanumerische Zeichen und Underscores
- Uniqueness: zwei Aufrufe geben verschiedene IDs

**goalsPath / readGoals / writeGoals (4)**
- `goalsPath`: gibt `.agentic/goals.json`-Pfad zurück
- `readGoals`: gibt `[]` wenn Datei fehlt
- `readGoals`: gibt `[]` bei corruptem JSON (graceful)
- `writeGoals`/`readGoals`: Roundtrip — gespeichertes Goal ist lesbar zurück

**parseTargetFromDescription (6)**
- "Close €500k this quarter" → 500000
- "$2M ARR this year" → 2000000
- "€1.5 million revenue" → 1500000
- "Close 10 deals" → 10 (kein € → raw number)
- "Book €75k of new business" → 75000
- "No number here at all" → 0 (fallback)

**inferGoalType (4)**
- "Close €500k ARR" → "revenue"
- "Build €200k pipeline" → "pipeline"
- "Book 10 meetings" → "relationship"
- "Retain churning customers" → "churn_prevention"

**rankDealsByLeverage (3)**
- Sortiert höchsten weighted-value Deal zuerst
- Filtert "won" und "lost" Deals heraus
- Deal mit 0 probability kommt ans Ende

**decomposeGoalRuleBased (6)**
- Mit 2 Deals, gap = 100k: Sub-Goals decken Gap ab
- Mit leerem Deals-Array: Sub-Goal "Build pipeline" generiert
- Gap bereits durch aktuellen P50 gedeckt: subGoals leer, analysis erklärt es
- Max. 5 Sub-Goals auch wenn mehr Deals vorhanden
- `targetDelta` summe der Sub-Goals >= gap (wenn Deals vorhanden)
- Sortiert Sub-Goals nach priority (1 = höchste)

**parseLlmDecomposition (4)**
- Parst valides JSON mit analysis + subGoals
- Extrahiert JSON aus Fließtext
- Gibt `fallback` zurück bei ungültigem JSON (nie null/crash)
- Gibt `fallback` zurück wenn subGoals-Array fehlt

**pursueGoal (5, integration via memfs)**
- Schreibt Goal in `goals.json`
- Returned Goal hat korrekte `id`, `status: "active"`, `target`
- Nutzt `buildInputFn`-Injection (kein echtes Filesystem nötig)
- Fällt auf rule-based zurück wenn `llmFn` returns unparseable
- `actor` aus options-Parameter im Goal gespeichert

**getActiveGoals / updateGoalProgress / cancelGoal (5)**
- `getActiveGoals`: gibt nur status="active" zurück
- `getActiveGoals`: gibt [] wenn keine Goals
- `updateGoalProgress`: aktualisiert progress + updatedAt
- `updateGoalProgress`: gibt null für unbekannte goalId
- `cancelGoal`: setzt status="cancelled", gibt null für unbekannte goalId

---

### `__tests__/mcp/tools/pursue-goal.test.ts` — ~8 Tests

- Erstellt Goal und gibt goalId zurück
- `decomposition.subGoals` ist Array in Response
- `decomposition.gap` = target - currentPipeline
- Nutzt injected `buildInputFn` für memfs-Testbarkeit
- RBAC: wirft Error wenn actor = rep
- RBAC: erlaubt manager-actor
- Registriert Tool mit korrektem Namen "pursue_goal"
- Gibt Fehler-Response bei ungültigem deadline-Format (nicht crash)

---

### `__tests__/mcp/tools/get-goal-status.test.ts` — ~5 Tests

- Gibt `{ goals: [], activeCount: 0 }` wenn keine Goals
- Gibt aktive Goals mit daysRemaining
- Filtert nur aktive Goals (excludes cancelled/completed)
- Gibt einzelnes Goal zurück wenn goalId angegeben
- Gibt Fehler-Response wenn goalId nicht gefunden

---

### Gesamt: +38 neue Tests → ~1208 total

---

## Implementierungsreihenfolge

1. **`src/core/goal-engine.ts`** — Typen + alle puren Funktionen + Persistenz
2. **`__tests__/core/goal-engine.test.ts`** — alle 30 Tests grün
3. **`src/core/rbac.ts`** — `pursue_goal` zu `admin` + `manager`
4. **`src/mcp/tools/pursue-goal.ts`** + `__tests__/mcp/tools/pursue-goal.test.ts`
5. **`src/mcp/tools/get-goal-status.ts`** + `__tests__/mcp/tools/get-goal-status.test.ts`
6. **`src/commands/goal.ts`** — CLI-Befehle
7. **`src/mcp/server.ts`** — 2 neue registerXxx() (25 tools total)
8. **`src/mcp/capabilities.ts`** — 2 neue Tool-Einträge
9. **`src/cli.ts`** — goalCommand hinzufügen
10. **Docs**: README.md + docs/mcp-tools.md + docs/index.html

---

## Integrationspunkte

### D14 (revenue-simulation.ts)

`pursueGoal` injiziert `buildInputFn` (default: `buildSimulationInput`) für Testbarkeit:

```typescript
export async function pursueGoal(dataDir, input, options = {}) {
  const buildFn = options.buildInputFn ?? buildSimulationInput;
  const simInput = await buildFn(dataDir, options.today);
  const result = runSimulation(simInput);
  const currentP50 = result.p50;
  // ...
}
```

In Tests: `buildInputFn: async () => ({ deals: [...mockDeals], today: "2026-05-27" })`

### D15 (playbooks.ts)

`decomposeGoalRuleBased` akzeptiert optionalen `playbookLookup`-Hook:

```typescript
export function decomposeGoalRuleBased(
  deals: DealSummary[],
  target: number,
  currentP50: number,
  today: string,
  playbookLookup?: (slug: string, deal: DealSummary) => string | undefined
): GoalDecomposition
```

In Production: Hook calls `getBestPlaybook(dataDir, slug, dealSnap)?.playbook.name`
In Tests: Hook ist undefined → kein Playbook-Lookup, keine memfs-Komplexität

### D12 (relationship-health.ts)

`observeDeal` in `deal-agent.ts` liefert bereits healthScore pro Deal.
In `decomposeGoalRuleBased` kommt healthScore aus `DealSummary` (aus `buildSimulationInput` → DealSnapshot).

---

## Pitfalls & Entscheidungen

### `parseTargetFromDescription` Robustheit

Unterstützte Formate:
- `€500k`, `€500,000`, `€500.000` (europäisches Format)
- `$2M`, `$2,000,000`
- `500k`, `1.5m`, `500000`

Regex-Strategie:
```typescript
// Reihenfolge: M > k > raw
// "€1.5M" → 1.5 × 1_000_000
// "€500k" → 500 × 1_000
// "€500000" → 500000
```

### `pursueGoal` mit leerer Pipeline

Wenn keine aktiven Deals → `decomposeGoalRuleBased` generiert einen einzelnen Sub-Goal:
```typescript
{ priority: 1, action: "Build pipeline", slug: "_all", why: "No active deals found",
  nextStep: "Use list_customers() to find prospects and create new deals",
  targetDelta: target }
```

### RBAC-Enforcement in `pursue-goal.ts`

Pattern aus `update-customer-facts.ts`:
```typescript
enforceRbac(dataDir, "pursue_goal");  // wirft Error bei unerlaubtem Zugriff
```

Wenn kein `rbac.json` → offener Zugang (gleiche Semantik wie alle anderen Tools).

### `DealSummary` vs. `DealSnapshot`

`DealSnapshot` (aus D14) hat `healthScore` und `championPresent` als required fields.
`buildSimulationInput` baut DealSnapshots aus pipeline.md + health.json.
In `goal-engine.ts` verwenden wir `DealSummary` als Type-Alias/Subset um keine Zirkular-Imports zu erzeugen:

```typescript
// DealSummary ist kompatibel mit DealSnapshot — kein neuer Typ nötig
import type { DealSnapshot as DealSummary } from "./revenue-simulation.js";
```

### LLM-Fallback-Garantie

`parseLlmDecomposition(response, fallback)` gibt **nie** `null` zurück — immer entweder
das geparste LLM-Ergebnis oder den `fallback` (rule-based decomposition).
Damit kann `pursueGoal` immer ein vollständiges Goal-Objekt zurückgeben.

### Test-Isolation für `pursueGoal`

`pursueGoal` liest Goals aus dem Filesystem und schreibt sie zurück.
Lösung: `vi.resetModules()` + `vol.reset()` in `beforeEach` + memfs-Mock für `fs`.
`buildInputFn` als DI-Parameter verhindert dass `buildSimulationInput` echte Kundendaten liest.

---

## Commit-Checkliste (vor Merge)

```
□ npm test → 1208+ Tests grün
□ npm run build → kein Build-Fehler
□ npm run typecheck → kein TypeScript-Fehler
□ README.md: 2 neue MCP-Tools + CLI-Commands in Tabellen
□ docs/mcp-tools.md: pursue_goal + get_goal_status Abschnitte
□ docs/index.html: nav count 23→25, 2 neue Sections
□ capabilities.ts: 2 neue Tool-Zeilen
□ RBAC-Tabelle in README/docs auf pursue_goal aktualisiert
```
