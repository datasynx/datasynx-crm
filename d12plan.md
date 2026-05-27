# D12 — Relationship Health Engine: Implementierungsplan

> Basis: plan-next-dxc.md · D12 · Stand: 2026-05-27
> TDD-First. Kein Produktionscode ohne vorherigen Test.
> Baut direkt auf D11 (graph.ts, graph-extractor.ts) auf.

---

## Was D12 liefert

`customers/acme-corp/health.json` — ein persistenter Health-Snapshot der automatisch nach jeder Interaktion aktualisiert wird. Für jeden bekannten Kontakt wird ein Score (0–100), ein Grade (A–F), ein Trend und konkrete Handlungsempfehlungen berechnet.

**Die Research-These (wörtlich):**
> "Relationship Decay Detection: a proactive alert when communication cadence breaks a learned baseline — before the relationship goes cold."

**User-sichtbare Änderungen:**
- Nach jedem `log_interaction` wird `health.json` still aktualisiert (fire-and-forget, kein Breaking Change)
- Neues MCP-Tool `get_relationship_health` gibt Stakeholder-Health zurück
- `dxcrm gdpr erase` löscht auch `health.json` (bereits durch rekursives rmSync abgedeckt)

**Was D12 NICHT tut (v1-Grenzen, explizit):**
- Kein LLM-Sentiment-Scoring — Sentiment bleibt 0.0 (neutral). D18 setzt echten Wert.
- Keine LinkedIn/Clearbit-Signale — `CONTACT_LEFT_COMPANY` wird erst in D18 gesetzt.
- Keine Response-Latenz-Messung — `responseScore` ist fest 50 (neutral). D17 hat echte Daten.
- Kein Proactive Alert-Dispatch — `CHAMPION_SILENT` wird gesetzt, aber erst D20 schickt Alerts.

---

## Neue Dateien

```
src/core/relationship-health.ts            ← Engine: Datenmodell + Score-Algorithmus + read/write
src/mcp/tools/get-relationship-health.ts   ← MCP-Tool Registration + Handler

__tests__/core/relationship-health.test.ts
__tests__/mcp/tools/get-relationship-health.test.ts
```

## Geänderte Dateien

```
src/mcp/tools/log-interaction.ts   ← health nach graph-update aktualisieren (fire-and-forget)
src/mcp/server.ts                  ← registerGetRelationshipHealth() hinzufügen
src/mcp/capabilities.ts            ← get_relationship_health in CAPABILITIES_TEXT
README.md                          ← neue Zeile in MCP-Tools-Tabelle
docs/mcp-tools.md                  ← vollständige Tool-Referenz
docs/index.html                    ← Nav + Section
```

---

## Datenmodell (exakt, TypeScript-ready)

### `src/core/relationship-health.ts`

```typescript
export type HealthGrade = "A" | "B" | "C" | "D" | "F";

export type HealthTrend = "rising" | "stable" | "declining" | "cold";

export type RiskFlag =
  | "NO_CONTACT_14D"           // daysSinceContact >= 14
  | "NO_CONTACT_30D"           // daysSinceContact >= 30
  | "SENTIMENT_DECLINING"      // sentimentTrend < -0.3 (D18 aktiviert dies)
  | "CHAMPION_SILENT"          // Kontakt ist IS_CHAMPION und score < 50
  | "DEAL_STALLED"             // aktiver Deal + kein Kontakt seit 14 Tagen
  | "CLOSE_DATE_PASSED"        // Deal-CloseDate liegt in der Vergangenheit
  | "CONTACT_LEFT_COMPANY"     // (D18) LinkedIn-Signal: Jobwechsel
  | "RESPONSE_LATENCY_INCREASING"; // (D17) Reply-Zeit-Trend steigt

export interface ContactHealth {
  contactId: string;       // "person:max@acme.com" — aus graph.ts ID-Konvention
  name: string;
  email?: string;
  score: number;           // 0–100
  grade: HealthGrade;
  trend: HealthTrend;
  daysSinceContact: number;
  avgCadenceDays: number;  // gelernter Baseline: Ø Tage zwischen Interaktionen
  sentimentTrend: number;  // -1.0 bis +1.0 — v1: immer 0.0
  riskFlags: RiskFlag[];
  lastContact: string;     // YYYY-MM-DD
  interactionCount30d: number;
  recommendation: string;  // human-readable Handlungsempfehlung
  updatedAt: string;       // ISO-8601
}

export interface HealthSnapshot {
  schemaVersion: "1";
  slug: string;
  contacts: ContactHealth[];
  overallHealth: number;   // Ø über alle Kontakte, 0–100
  updatedAt: string;
}
```

### Score-Formel

```
score = round(
  recencyScore   × 0.35   // Wie lange ist der letzte Kontakt her?
  + cadenceScore × 0.25   // Weicht der aktuelle Abstand vom Baseline-Rhythmus ab?
  + sentimentScore × 0.20 // Wie ist die Stimmung? (v1: immer 50)
  + responseScore  × 0.10 // Antwortzeit-Trend (v1: immer 50)
  + momentumScore  × 0.10 // Interaktionsfrequenz: letzte 30d vs. vorherige 30d
)
```

**Komponenten:**

| Komponente | 100 | 50 | 0 |
|---|---|---|---|
| recencyScore | 0 Tage | 15 Tage | ≥30 Tage |
| cadenceScore | ≤1× Baseline | 2× Baseline | ≥3× Baseline |
| sentimentScore | v1: fest 50 | — | — |
| responseScore | v1: fest 50 | — | — |
| momentumScore | ≥1.5× vs. Vormonat | gleich | ≤0.25× vs. Vormonat |

**Grade-Schwellen:** A ≥ 80 · B ≥ 60 · C ≥ 40 · D ≥ 20 · F < 20

**Trend-Klassifikation (basiert auf aktuellem Zustand, kein historischer Vergleich):**
- `"cold"`: score < 20 ODER daysSinceContact ≥ 30
- `"declining"`: momentumScore < 30 ODER (daysSinceContact > avgCadenceDays × 1.5 UND score < 60)
- `"rising"`: momentumScore > 70 UND score > 60
- `"stable"`: alles andere

### `health.json` — Beispieldatei

```json
{
  "schemaVersion": "1",
  "slug": "acme-corp",
  "contacts": [
    {
      "contactId": "person:max@acme.com",
      "name": "Max Müller",
      "email": "max@acme.com",
      "score": 72,
      "grade": "B",
      "trend": "stable",
      "daysSinceContact": 5,
      "avgCadenceDays": 7,
      "sentimentTrend": 0,
      "riskFlags": [],
      "lastContact": "2026-05-22",
      "interactionCount30d": 4,
      "recommendation": "Max Müller — grade B. Next contact due in ~2 days.",
      "updatedAt": "2026-05-27T00:00:00.000Z"
    },
    {
      "contactId": "person:cfo@acme.com",
      "name": "Thomas Berger",
      "email": "cfo@acme.com",
      "score": 18,
      "grade": "F",
      "trend": "cold",
      "daysSinceContact": 32,
      "avgCadenceDays": 14,
      "sentimentTrend": 0,
      "riskFlags": ["NO_CONTACT_30D", "CHAMPION_SILENT"],
      "lastContact": "2026-04-25",
      "interactionCount30d": 0,
      "recommendation": "Re-engage Thomas Berger urgently — no contact in 32 days.",
      "updatedAt": "2026-05-27T00:00:00.000Z"
    }
  ],
  "overallHealth": 45,
  "updatedAt": "2026-05-27T00:00:00.000Z"
}
```

---

## Datei 1: `src/core/relationship-health.ts` — vollständige API

### Imports

```typescript
import fs from "fs";
import path from "path";
import { readGraph, findNodesByType } from "./graph.js";
import { extractEmail, extractDisplayName, makePersonId } from "./graph-extractor.js";
```

### Dateipfad

```typescript
export function healthPath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "health.json");
}
```

### Lesen / Schreiben

```typescript
export function readHealth(dataDir: string, slug: string): HealthSnapshot | null {
  const p = healthPath(dataDir, slug);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as HealthSnapshot;
  } catch {
    return null;
  }
}

export function writeHealth(dataDir: string, slug: string, health: HealthSnapshot): void {
  const p = healthPath(dataDir, slug);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const updated: HealthSnapshot = { ...health, updatedAt: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(updated, null, 2), "utf-8");
}
```

### Interaction-Parsing

Ziel: `interactions.md` in strukturierte Einzel-Interaktionen zerlegen.

```typescript
export interface ParsedInteraction {
  date: string;     // YYYY-MM-DD
  type: string;     // "Call" | "Email" | ...
  withStr: string;  // Roh-String aus **With:** / **Subject:** Zeile
}

export function parseContactInteractions(content: string): ParsedInteraction[] {
  // Blöcke auf ## YYYY-MM-DD Überschriften aufteilen
  const blocks = content
    .split(/(?=^## \d{4}-\d{2}-\d{2})/m)
    .filter((b) => b.trim().length > 0);

  const result: ParsedInteraction[] = [];
  for (const block of blocks) {
    const headingMatch = block.match(/^## (\d{4}-\d{2}-\d{2}) · (\w+)/m);
    if (!headingMatch) continue;
    const date = headingMatch[1]!;
    const type = headingMatch[2]!;

    // "**With:** ..." oder "**Subject:** ..." — beide enthalten den Kontakt
    const withMatch = block.match(/^\*\*(?:With|Subject):\*\*\s*(.+)$/m);
    if (!withMatch) continue;
    const withStr = withMatch[1]!.trim();

    result.push({ date, type, withStr });
  }
  return result;
}
```

**Hinweis zu Email-Typ:** `formatInteractionEntry` schreibt bei `type === "Email"` die Zeile als `**Subject:** <with-value>`. Das ist ein historisches Quirk der Code-Base. D12 parst trotzdem den Kontakt-String korrekt, weil `entry.with` immer den Kontakt enthält (nicht den Email-Betreff).

### Score-Funktionen (pure, testbar)

```typescript
// recencyScore: linear 100 → 0 über 30 Tage
export function calcRecencyScore(daysSince: number): number {
  if (daysSince <= 0) return 100;
  if (daysSince >= 30) return 0;
  return Math.round(100 * (1 - daysSince / 30));
}

// cadenceScore: wie stark weicht daysSince vom gelernten Rhythmus ab?
// ratio ≤ 1.0 → 100, ratio ≥ 3.0 → 0, linear dazwischen
export function calcCadenceScore(daysSince: number, avgCadenceDays: number): number {
  if (avgCadenceDays <= 0) return 50; // kein Baseline bekannt
  const ratio = daysSince / avgCadenceDays;
  if (ratio <= 1.0) return 100;
  if (ratio >= 3.0) return 0;
  return Math.round(100 * (1 - (ratio - 1.0) / 2.0));
}

// momentumScore: last30d vs prev30d — steigend = gut
export function calcMomentumScore(last30d: number, prev30d: number): number {
  if (last30d === 0 && prev30d === 0) return 50; // kein Verlauf
  if (prev30d === 0) return 80; // neuer Kontakt, guter Start
  const ratio = last30d / prev30d;
  if (ratio >= 1.5) return 100;
  if (ratio >= 1.0) return 75;
  if (ratio >= 0.5) return 50;
  if (ratio >= 0.25) return 25;
  return 0;
}

// Grade aus Score
export function gradeFromScore(score: number): HealthGrade {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

// Trend aus aktuellem Zustand (kein historischer Vergleich nötig)
export function trendFromState(
  score: number,
  daysSince: number,
  avgCadenceDays: number,
  momentumScore: number
): HealthTrend {
  if (score < 20 || daysSince >= 30) return "cold";
  if (momentumScore > 70 && score > 60) return "rising";
  if (momentumScore < 30 || (daysSince > avgCadenceDays * 1.5 && score < 60)) return "declining";
  return "stable";
}
```

### Recommendation-Text

```typescript
export function generateRecommendation(
  name: string,
  grade: HealthGrade,
  trend: HealthTrend,
  riskFlags: RiskFlag[],
  daysSince: number,
  avgCadenceDays: number
): string {
  if (riskFlags.includes("NO_CONTACT_30D")) {
    return `Re-engage ${name} urgently — no contact in ${daysSince} days.`;
  }
  if (riskFlags.includes("CHAMPION_SILENT")) {
    return `Champion ${name} has gone quiet — critical to re-engage before deal stalls.`;
  }
  if (riskFlags.includes("NO_CONTACT_14D")) {
    return `Schedule contact with ${name} — ${daysSince} days since last touchpoint.`;
  }
  if (trend === "declining") {
    return `${name} relationship declining — increase touchpoint frequency.`;
  }
  if (grade === "A") {
    return `${name} — strong relationship. Keep current cadence.`;
  }
  const daysUntilDue = Math.max(0, avgCadenceDays - daysSince);
  return `${name} — grade ${grade}. Next contact due in ~${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}.`;
}
```

### Risk-Flags berechnen

```typescript
export function calcRiskFlags(
  contactId: string,
  daysSince: number,
  score: number,
  isChampion: boolean
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (daysSince >= 30) flags.push("NO_CONTACT_30D");
  if (daysSince >= 14) flags.push("NO_CONTACT_14D");
  if (isChampion && score < 50) flags.push("CHAMPION_SILENT");
  return flags;
}
```

**Hinweis:** `DEAL_STALLED`, `CLOSE_DATE_PASSED`, `SENTIMENT_DECLINING`, `RESPONSE_LATENCY_INCREASING` und `CONTACT_LEFT_COMPANY` werden in späteren Dominos (D17, D18, D20) gesetzt. D12 reserved die Typen, implementiert aber nur die obigen drei.

### Pro-Kontakt Health berechnen

```typescript
export interface ContactInteractionGroup {
  contactId: string;
  name: string;
  email?: string;
  interactions: ParsedInteraction[];  // chronologisch sortiert (neueste zuerst)
}

export function computeContactHealth(
  group: ContactInteractionGroup,
  today: string,        // YYYY-MM-DD — injiziert für Testbarkeit
  isChampion: boolean
): ContactHealth {
  const interactions = group.interactions;

  // Letzter Kontakt
  const lastContact = interactions[0]?.date ?? "";
  const daysSince = lastContact
    ? Math.floor(
        (new Date(today).getTime() - new Date(lastContact).getTime()) / 86_400_000
      )
    : 999;

  // Ø Kadenz lernen (aus allen Abständen zwischen aufeinanderfolgenden Interaktionen)
  const avgCadenceDays = calcAvgCadence(interactions);

  // Interaktions-Count für Momentum
  const todayMs = new Date(today).getTime();
  const d30 = todayMs - 30 * 86_400_000;
  const d60 = todayMs - 60 * 86_400_000;
  const last30d = interactions.filter((i) => new Date(i.date).getTime() >= d30).length;
  const prev30d = interactions.filter(
    (i) => new Date(i.date).getTime() >= d60 && new Date(i.date).getTime() < d30
  ).length;

  // Score-Komponenten (sentiment + response bleiben v1 bei 50)
  const recency = calcRecencyScore(daysSince);
  const cadence = calcCadenceScore(daysSince, avgCadenceDays);
  const sentiment = 50; // v1: neutral
  const response = 50;  // v1: neutral
  const momentum = calcMomentumScore(last30d, prev30d);

  const score = Math.round(
    recency * 0.35 + cadence * 0.25 + sentiment * 0.20 + response * 0.10 + momentum * 0.10
  );

  const grade = gradeFromScore(score);
  const trend = trendFromState(score, daysSince, avgCadenceDays, momentum);
  const riskFlags = calcRiskFlags(group.contactId, daysSince, score, isChampion);
  const recommendation = generateRecommendation(
    group.name,
    grade,
    trend,
    riskFlags,
    daysSince,
    avgCadenceDays
  );

  return {
    contactId: group.contactId,
    name: group.name,
    ...(group.email !== undefined ? { email: group.email } : {}),
    score,
    grade,
    trend,
    daysSinceContact: daysSince,
    avgCadenceDays,
    sentimentTrend: 0,
    riskFlags,
    lastContact,
    interactionCount30d: last30d,
    recommendation,
    updatedAt: new Date().toISOString(),
  };
}

// Ø Tage zwischen aufeinanderfolgenden Interaktionen (neueste zuerst sortiert)
export function calcAvgCadence(interactions: ParsedInteraction[]): number {
  if (interactions.length < 2) return 0;
  const sorted = [...interactions].sort((a, b) => b.date.localeCompare(a.date)); // neueste zuerst
  let totalDays = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = Math.floor(
      (new Date(sorted[i]!.date).getTime() - new Date(sorted[i + 1]!.date).getTime()) / 86_400_000
    );
    totalDays += gap;
  }
  return Math.round(totalDays / (sorted.length - 1));
}
```

### Kontakte gruppieren (Interactions → Map)

```typescript
export function groupInteractionsByContact(
  interactions: ParsedInteraction[],
  slug: string
): ContactInteractionGroup[] {
  const map = new Map<
    string,
    { contactId: string; name: string; email?: string; interactions: ParsedInteraction[] }
  >();

  for (const ix of interactions) {
    const email = extractEmail(ix.withStr);
    const name = extractDisplayName(ix.withStr);
    const contactId = makePersonId(ix.withStr, slug);

    if (!map.has(contactId)) {
      map.set(contactId, {
        contactId,
        name,
        ...(email !== undefined ? { email } : {}),
        interactions: [],
      });
    }
    map.get(contactId)!.interactions.push(ix);
  }

  return Array.from(map.values());
}
```

### Haupt-Funktion: Customer-Health berechnen

```typescript
export function computeCustomerHealth(
  dataDir: string,
  slug: string,
  today: string = new Date().toISOString().slice(0, 10)
): HealthSnapshot {
  // Interactions lesen und parsen
  const interactionsPath = path.join(dataDir, "customers", slug, "interactions.md");
  const content = fs.existsSync(interactionsPath)
    ? (fs.readFileSync(interactionsPath, "utf-8") as string)
    : "";

  const parsed = parseContactInteractions(content);
  const groups = groupInteractionsByContact(parsed, slug);

  // Champions aus graph.json ermitteln
  const graph = readGraph(dataDir, slug);
  const championIds = new Set(
    graph.edges
      .filter((e) => e.type === "IS_CHAMPION")
      .map((e) => e.from)
  );

  // Pro-Kontakt Health berechnen
  const contacts = groups.map((group) =>
    computeContactHealth(group, today, championIds.has(group.contactId))
  );

  const overallHealth =
    contacts.length === 0
      ? 100
      : Math.round(contacts.reduce((sum, c) => sum + c.score, 0) / contacts.length);

  return {
    schemaVersion: "1",
    slug,
    contacts,
    overallHealth,
    updatedAt: new Date().toISOString(),
  };
}
```

### Fire-and-forget Update (Integration mit log_interaction)

```typescript
export async function updateHealthFromInteraction(
  dataDir: string,
  slug: string
): Promise<void> {
  const health = computeCustomerHealth(dataDir, slug);
  writeHealth(dataDir, slug, health);
}
```

**Warum kein `today`-Parameter hier?** Die Funktion wird immer mit dem echten heutigen Datum aufgerufen. `today` ist nur für Tests injizierbar über `computeCustomerHealth` direkt.

---

## Datei 2: `src/mcp/tools/get-relationship-health.ts`

```typescript
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readHealth, computeCustomerHealth, writeHealth } from "../../core/relationship-health.js";

const DATA_DIR = process.cwd();
const MAX_HEALTH_AGE_MS = 60 * 60 * 1000; // 1 Stunde

export async function handleGetRelationshipHealth(
  input: { slug: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    // Snapshot aus Datei lesen oder neu berechnen wenn fehlt / veraltet
    let health = readHealth(dataDir, input.slug);
    if (
      health === null ||
      Date.now() - new Date(health.updatedAt).getTime() > MAX_HEALTH_AGE_MS
    ) {
      health = computeCustomerHealth(dataDir, input.slug);
      writeHealth(dataDir, input.slug, health);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              slug: input.slug,
              overallHealth: health.overallHealth,
              updatedAt: health.updatedAt,
              atRiskContacts: health.contacts
                .filter((c) => c.riskFlags.length > 0)
                .map((c) => c.email ?? c.contactId),
              coldContacts: health.contacts
                .filter((c) => c.trend === "cold")
                .map((c) => c.email ?? c.contactId),
              contacts: health.contacts,
            },
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

export function registerGetRelationshipHealth(server: McpServer): void {
  server.registerTool(
    "get_relationship_health",
    {
      title: "Get Relationship Health",
      description: `Returns health scores for all contacts of a customer.
Scores decay automatically when communication cadence breaks — without any manual input.

Each contact gets:
- score (0–100), grade (A–F), trend (rising|stable|declining|cold)
- riskFlags: NO_CONTACT_14D, NO_CONTACT_30D, CHAMPION_SILENT
- recommendation: concrete next action

overallHealth is the average across all contacts.
atRiskContacts + coldContacts are pre-filtered for quick triage.

Health is auto-updated after every log_interaction call.

Args:
  slug: Customer slug

Returns: {
  overallHealth: number,
  atRiskContacts: string[],
  coldContacts: string[],
  contacts: ContactHealth[]
}`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug (e.g. 'acme-corp')"),
      }),
    },
    async ({ slug }) => handleGetRelationshipHealth({ slug })
  );
}
```

**Stale-Logik:** Das Tool berechnet frisch, wenn `health.json` fehlt oder älter als 1 Stunde ist. Damit ist der erste Aufruf nach einem langen Zeitraum immer aktuell — auch wenn in der Zwischenzeit keine Interaktion geloggt wurde (z.B. Urlaub → Score ist abgesunken).

---

## Integration: `src/mcp/tools/log-interaction.ts`

**Einfügestelle:** direkt nach dem graph-update Block (nach Zeile mit `updateGraphFromInteraction`).

```typescript
// NEU — nach dem graph fire-and-forget
import { updateHealthFromInteraction } from "../../core/relationship-health.js";

// Im handleLogInteraction, nach dem graph-update:
updateHealthFromInteraction(dataDir, input.slug).catch(() => {
  // non-critical — interaction already written
});
```

**Reihenfolge der fire-and-forgets:**
1. `updateGraphFromInteraction` — Graph aktualisieren
2. `updateHealthFromInteraction` — Health auf Basis des neuen Graphs berechnen

`updateHealthFromInteraction` ruft intern `readGraph` auf — läuft also NACH dem Graph-Update. Da beide fire-and-forget sind, ist keine Synchronisation nötig: beide laufen parallel, und `updateHealthFromInteraction` liest einfach den Graph-Stand zum Zeitpunkt des Aufrufs. Im schlimmsten Fall (race) hat health.json noch den alten Graph-Stand — was vollständig akzeptabel ist.

---

## Integration: `src/mcp/server.ts`

```typescript
// Import hinzufügen:
import { registerGetRelationshipHealth } from "./tools/get-relationship-health.js";

// In createMcpServer() nach registerGetRelationshipGraph:
registerGetRelationshipHealth(server);
// Kommentar aktualisieren: // Register all 16 tools
```

---

## Integration: `src/mcp/capabilities.ts`

Neue Zeile in der Tool-Tabelle:

```
| get_relationship_health | Health-Scores pro Kontakt, Decay-Erkennung, Empfehlungen | any |
```

Neuer Referenz-Block:

```
### get_relationship_health({ slug })
Computes health scores for all contacts: score (0-100), grade (A-F), trend, risk flags,
and a concrete recommendation per contact. Auto-refreshes if stale (>1h).
- Input: { slug: string }
- Returns: { overallHealth, atRiskContacts[], coldContacts[], contacts: ContactHealth[] }
```

---

## TDD — Test-Spezifikationen

### `__tests__/core/relationship-health.test.ts`

#### parseContactInteractions

```
describe("parseContactInteractions")
  ✓ returns empty array for empty string
  ✓ parses single Call entry — date + type + withStr
  ✓ parses **With:** label correctly
  ✓ parses **Subject:** label (Email type) — still extracts withStr
  ✓ parses multiple entries — returns all of them
  ✓ skips blocks without **With:** or **Subject:** line
  ✓ trims whitespace from withStr
```

**Fixtures** (minimaler interactions.md-Block):

```markdown
## 2026-05-27 · Call
**With:** Max Müller <max@acme.com>
**Summary:** Discussed renewal.
**Next Steps:**
- [ ] Send proposal
**Source:** agent://log/1
**Synced:** 2026-05-27T10:00:00.000Z
---
```

#### calcRecencyScore

```
describe("calcRecencyScore")
  ✓ returns 100 for 0 days
  ✓ returns 100 for 1 day (rundet auf 97 → also: > 90)
  ✓ returns ~50 for 15 days (erwartet: 50)
  ✓ returns 0 for 30 days
  ✓ returns 0 for 31 days (clamped)
  ✓ returns 0 for 999 days (clamped)
```

Exakte Erwartungswerte:
- `calcRecencyScore(0)` → 100
- `calcRecencyScore(15)` → 50
- `calcRecencyScore(30)` → 0
- `calcRecencyScore(45)` → 0

#### calcCadenceScore

```
describe("calcCadenceScore")
  ✓ returns 100 when daysSince ≤ avgCadenceDays (on-schedule)
  ✓ returns 50 when avgCadenceDays is 0 (no baseline)
  ✓ returns 50 when daysSince = 2× avgCadenceDays
  ✓ returns 0 when daysSince ≥ 3× avgCadenceDays
  ✓ returns value between 0–100 for intermediate ratios
```

Exakte Erwartungswerte:
- `calcCadenceScore(7, 7)` → 100
- `calcCadenceScore(0, 7)` → 100 (daysSince = 0 ≤ avg)
- `calcCadenceScore(14, 7)` → 50 (ratio = 2.0)
- `calcCadenceScore(21, 7)` → 0 (ratio = 3.0)
- `calcCadenceScore(7, 0)` → 50 (kein Baseline)

#### calcMomentumScore

```
describe("calcMomentumScore")
  ✓ returns 50 when both 0 (no history)
  ✓ returns 80 when prev30d = 0 (new contact)
  ✓ returns 100 when last30d ≥ 1.5× prev30d
  ✓ returns 75 when last30d = prev30d
  ✓ returns 50 when last30d = 0.5× prev30d
  ✓ returns 0 when last30d ≤ 0.25× prev30d
```

#### calcAvgCadence

```
describe("calcAvgCadence")
  ✓ returns 0 for empty array
  ✓ returns 0 for single interaction
  ✓ returns correct average for 2 interactions 7 days apart
  ✓ returns correct average for 3 interactions with unequal gaps
  ✓ handles interactions in any order (sorts internally)
```

#### gradeFromScore

```
describe("gradeFromScore")
  ✓ 100 → "A"
  ✓ 80 → "A"
  ✓ 79 → "B"
  ✓ 60 → "B"
  ✓ 59 → "C"
  ✓ 40 → "C"
  ✓ 39 → "D"
  ✓ 20 → "D"
  ✓ 19 → "F"
  ✓ 0 → "F"
```

#### trendFromState

```
describe("trendFromState")
  ✓ score < 20 → "cold"
  ✓ daysSince >= 30 → "cold" (auch wenn score > 20)
  ✓ momentumScore > 70 AND score > 60 → "rising"
  ✓ momentumScore < 30 → "declining"
  ✓ daysSince > avgCadence × 1.5 AND score < 60 → "declining"
  ✓ neutral case → "stable"
```

#### calcRiskFlags

```
describe("calcRiskFlags")
  ✓ NO_CONTACT_14D set when daysSince >= 14
  ✓ NO_CONTACT_30D set when daysSince >= 30
  ✓ both NO_CONTACT_14D and NO_CONTACT_30D set when daysSince >= 30
  ✓ CHAMPION_SILENT set when isChampion = true AND score < 50
  ✓ CHAMPION_SILENT NOT set when isChampion = false
  ✓ CHAMPION_SILENT NOT set when isChampion = true AND score >= 50
  ✓ empty flags when daysSince < 14 and not champion
```

#### groupInteractionsByContact

```
describe("groupInteractionsByContact")
  ✓ returns empty array for no interactions
  ✓ groups interactions by email (same person twice = 1 group)
  ✓ groups by name-slug when no email (same name = 1 group)
  ✓ different people → different groups
  ✓ email is set on group when extractable
  ✓ name is extractDisplayName of withStr
```

#### computeContactHealth

```
describe("computeContactHealth")
  ✓ score is between 0 and 100
  ✓ grade matches score thresholds
  ✓ lastContact is set to most recent interaction date
  ✓ daysSinceContact correct for given today
  ✓ interactionCount30d counts correctly
  ✓ riskFlags includes NO_CONTACT_14D when 14+ days
  ✓ riskFlags includes CHAMPION_SILENT when isChampion + score < 50
  ✓ recommendation is non-empty string
  ✓ sentimentTrend is 0 (v1 neutral)
  ✓ trend is "cold" when daysSince >= 30
```

#### computeCustomerHealth (Integration, memfs)

```
describe("computeCustomerHealth")
  ✓ returns overallHealth 100 and empty contacts when interactions.md does not exist
  ✓ returns one contact per unique person in interactions
  ✓ overallHealth is average of contact scores
  ✓ uses graph.json to detect IS_CHAMPION for CHAMPION_SILENT flag
  ✓ handles missing graph.json gracefully (empty graph)
  ✓ does not throw when customers dir does not exist
```

#### readHealth / writeHealth roundtrip

```
describe("readHealth / writeHealth")
  ✓ returns null when health.json does not exist
  ✓ written health is readable via memfs
  ✓ updatedAt is refreshed on write
  ✓ returns null on corrupted health.json (graceful)
```

---

### `__tests__/mcp/tools/get-relationship-health.test.ts`

```
describe("handleGetRelationshipHealth")
  ✓ returns overallHealth 100 + empty contacts when no interactions
  ✓ returns contacts array with health data
  ✓ atRiskContacts contains emails of contacts with riskFlags
  ✓ coldContacts contains contacts with trend = "cold"
  ✓ reads from health.json when fresh (< 1h old)
  ✓ recomputes when health.json is stale (updatedAt > 1h ago)
  ✓ recomputes when health.json does not exist
  ✓ returns success:false on unexpected error

describe("registerGetRelationshipHealth — MCP registration")
  ✓ registers tool with name get_relationship_health
```

---

## Implementierungsreihenfolge (8 Schritte)

```
Schritt 1: Tests schreiben
  → __tests__/core/relationship-health.test.ts   (alle rot)
  → __tests__/mcp/tools/get-relationship-health.test.ts (alle rot)

Schritt 2: Datenmodell + pure Hilfsfunktionen
  → src/core/relationship-health.ts
  → calcRecencyScore, calcCadenceScore, calcMomentumScore
  → gradeFromScore, trendFromState, calcRiskFlags, calcAvgCadence
  → generateRecommendation
  → npm test __tests__/core/relationship-health.test.ts → Hilfsfunktionen grün

Schritt 3: Parsing
  → parseContactInteractions, groupInteractionsByContact
  → npm test → Parsing-Tests grün

Schritt 4: computeContactHealth
  → computeContactHealth implementieren
  → npm test → computeContactHealth grün

Schritt 5: computeCustomerHealth + read/write
  → healthPath, readHealth, writeHealth
  → computeCustomerHealth (liest interactions.md + graph.json)
  → updateHealthFromInteraction
  → npm test __tests__/core/relationship-health.test.ts → alle grün

Schritt 6: MCP-Tool
  → src/mcp/tools/get-relationship-health.ts
  → handleGetRelationshipHealth + registerGetRelationshipHealth
  → npm test __tests__/mcp/tools/get-relationship-health.test.ts → alle grün

Schritt 7: Integration
  → src/mcp/tools/log-interaction.ts — updateHealthFromInteraction fire-and-forget
  → src/mcp/server.ts — registerGetRelationshipHealth()
  → src/mcp/capabilities.ts — Tabelle + Referenz-Block

Schritt 8: Full-Suite + Docs + Commit
  → npm test → alle Tests grün
  → npm run build → kein Fehler
  → npm run typecheck → kein Fehler
  → README.md, docs/mcp-tools.md, docs/index.html aktualisieren
  → git commit + git push + merge to main
```

---

## Wichtige Implementierungsdetails (Fallstricke)

### TypeScript `exactOptionalPropertyTypes`

`email` ist optional in `ContactHealth`. Nicht so schreiben:

```typescript
// FALSCH — compile error
const c: ContactHealth = { email: group.email, ... };
```

Stattdessen:

```typescript
// KORREKT
const c: ContactHealth = {
  ...(group.email !== undefined ? { email: group.email } : {}),
  ...
};
```

Das gleiche gilt für alle optionalen Felder in `ContactInteractionGroup`.

### Date-Arithmetic

Alle Date-Berechnungen über `new Date(dateStr).getTime()` in Millisekunden, dann durch 86.400.000 teilen. Keine `Date.prototype.getDay()` oder Timezone-abhängige Funktionen.

```typescript
const daysSince = Math.floor(
  (new Date(today).getTime() - new Date(lastContact).getTime()) / 86_400_000
);
```

**Wichtig:** `today` ist ein YYYY-MM-DD String (kein `new Date()`). Der Parameter wird in Tests injiziert, damit Datum-abhängige Tests deterministisch sind.

### Sortierung in `calcAvgCadence`

Interactions aus `interactions.md` sind neueste-zuerst (newest-first) gespeichert. `calcAvgCadence` sortiert intern noch mal neu (`b.date.localeCompare(a.date)` für neueste-zuerst) — das macht sie unabhängig von der Eingabe-Reihenfolge.

### memfs-Mocking in Tests

Alle Tests folgen dem D11-Muster:

```typescript
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

it("...", async () => {
  vol.fromJSON({ ... });
  const { computeCustomerHealth } = await import("../../src/core/relationship-health.js");
  // ...
});
```

`today` immer als Parameter übergeben, nie `new Date()` direkt in Tests verwenden:

```typescript
const result = computeCustomerHealth(DATA_DIR, SLUG, "2026-05-27");
```

### Stale-Threshold in handleGetRelationshipHealth

Die 1-Stunden-Grenze (`MAX_HEALTH_AGE_MS = 60 * 60 * 1000`) in Tests überschreiben durch Einfügen einer alten `updatedAt`:

```typescript
vol.fromJSON({
  [`${DATA_DIR}/customers/${SLUG}/health.json`]: JSON.stringify({
    schemaVersion: "1",
    slug: SLUG,
    contacts: [],
    overallHealth: 42,
    updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2h alt
  }),
});
// → Tool muss neu berechnen
```

---

## Daten-Abhängigkeiten

```
interactions.md  ──────────────────────────────▶  parseContactInteractions
                                                    ↓
                                            groupInteractionsByContact
                                                    ↓
graph.json  ─────── IS_CHAMPION edges ─────▶  computeContactHealth (championIds)
                                                    ↓
                                            computeCustomerHealth
                                                    ↓
                                            writeHealth → health.json
                                                    ↓
                                        get_relationship_health (MCP)
```

D12 konsumiert D11 (graph.json) read-only. Kein Write auf graph.json. Kein Circular Dependency.

---

## Test-Count Prognose

| Datei | Tests |
|---|---|
| `__tests__/core/relationship-health.test.ts` | ~45 |
| `__tests__/mcp/tools/get-relationship-health.test.ts` | ~9 |
| **Gesamt neue Tests** | **~54** |
| Gesamt nach D12 | **~907** |
