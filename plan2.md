# DatasynxOpenCRM — Phase 2 Kickoff-Guide
**Titel:** Das Flywheel · **Wochen 5–8**
**Erstellt:** 2026-05-26 · **Revidiert:** 2026-05-26 · **Basis:** Phase 1 vollständig abgeschlossen ✅

> Dieses Dokument ist kein Spec (das bleibt `plan.md`). Es ist der technische Wissenstransfer
> aus Phase 1 — was gelernt wurde, was uns überraschte, und was Phase 2 wirklich braucht.

---

## 1 — Was Phase 1 wirklich geliefert hat

### Zahlen (Stand 2026-05-26)

| Metrik | Wert |
|---|---|
| Tests | 336 (alle grün) |
| Test-Dateien | 36 |
| MCP-Tools | 8 |
| Framework-Adapter | 9 |
| CLI-Commands | 12 (init, create, list, validate, session, guide, sync, backup, restore, daemon, mcp start, mcp docs) |
| Build-Output | ESM-only (kein CJS) |
| Embedding-Modell | `all-MiniLM-L6-v2` — 384-dim Float32, ~25 MB |
| LanceDB-Schema | Float32-Vector + source_ref BTree-Index, mergeInsert-Upsert |
| Daemon-Interval | 30 Min (nicht 15 wie geplant — Gmail Dev-App Quota bis zur Google-Verifizierung) |

---

## 2 — Abweichungen vom ursprünglichen Plan (Nicht rückgängig machen)

Diese Entscheidungen wurden unter Realitätsdruck getroffen. Sie gelten als stabilisiert.

| Geplant | Implementiert | Grund |
|---|---|---|
| `postinstall.js` | `dxcrm init` (expliziter Befehl) | pnpm v10 blockiert postinstall-Skripte in Security-Modus |
| `tsup` | `tsdown` (Rolldown-basiert) | tsdown ist der offizielle Nachfolger, schneller, ESM-nativer |
| `chalk` | `ansis` | Leichter, ESM-first, kein globaler State |
| `@xenova/transformers` | `@huggingface/transformers` v3.8.1 | @xenova ist deprecated, HuggingFace ist der offizielle Nachfolger |
| `format: ["esm", "cjs"]` | `format: ["esm"]` | Top-level `await` in `cli.ts` und `daemon/worker.ts` inkompatibel mit CJS |
| 15-Min-Daemon | 30-Min-Daemon | Gmail Dev-App: 250 Units/Tag. Nach Google OAuth-Verifizierung: 1 Mrd Units/Tag → kann auf 10 Min reduziert werden |
| `instructions` in McpServer() | Instructions in Tool-Descriptions | MCP SDK v1.x hat kein `instructions`-Feld im Konstruktor |
| `server.tool()` | `server.registerTool()` | `server.tool()` ist deprecated ab MCP SDK v1.0 |
| LLM-basierte E-Mail-Extraktion | Header + Snippet direkt | War Phase 1-Shortcut — LLM-Summary kommt in Phase 2 Woche 6 |
| LLM-Kundenerkennung in Transcripts | Default-Kunde (erster in `customers/`) | War Phase 1-Shortcut — LLM-Erkennung kommt in Phase 2 Woche 6 |
| `ContextBlock`-Objekt | `string` (Markdown) | Ausreichend für Phase 1 — strukturiertes Output in Phase 2 optional |

---

## 3 — Technische Gotchas (Phase 2 wird sie wiedersehen)

### 3.1 MCP SDK v1.x — Was NICHT existiert

```typescript
// FALSCH — existiert nicht in v1.x:
new McpServer({ instructions: "..." })
server.tool("name", schema, handler)  // deprecated

// KORREKT:
new McpServer({ name: "...", version: "..." })
server.registerTool("name", { title, description, inputSchema }, handler)
```

### 3.2 gray-matter: NIEMALS `matter.read()` verwenden

`matter.read(path)` liest die Datei direkt mit dem echten `fs` — bypassed memfs vollständig.

```typescript
// FALSCH (in getesteten Funktionen):
const raw = matter.read(filePath);

// KORREKT:
const content = fs.readFileSync(filePath, "utf-8");
const raw = matter(content);

// KORREKT für Frontmatter-Update:
const raw = matter(fs.readFileSync(mainFactsPath, "utf-8"));
raw.data.last_touchpoint = today;
fs.writeFileSync(mainFactsPath, matter.stringify(raw.content, raw.data), "utf-8");
```

### 3.3 LanceDB v0.29+ — Korrekte API

```typescript
import * as lancedb from "@lancedb/lancedb";
import { Index, makeArrowTable } from "@lancedb/lancedb";
import { Schema, Field, FixedSizeList, Float32 as ArrowFloat32, Utf8 } from "apache-arrow";

// Upsert-Pattern:
await table.mergeInsert("source_ref")
  .whenMatchedUpdateAll()
  .whenNotMatchedInsertAll()
  .execute(data);

// BTree-Index (für scalar fields):
await table.createIndex("source_ref", { config: Index.btree() });
```

### 3.4 @huggingface/transformers v3.8.1 — Singleton-Pattern

```typescript
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";

env.cacheDir = path.join(homedir(), ".cache", "datasynx-opencrm", "models");

class EmbeddingPipeline {
  private static instance: Promise<FeatureExtractionPipeline> | null = null;
  static get(): Promise<FeatureExtractionPipeline> {
    if (!this.instance) {
      process.stdout.write("Loading embedding model (first time, ~25MB)...\n");
      this.instance = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2") as Promise<...>;
    }
    return this.instance;
  }
  static reset(): void { this.instance = null; }
}
```

**Wichtig in Tests:** `resetEmbeddingPipeline()` in `beforeEach` aufrufen UND `vi.clearAllMocks()`.
**Wichtig allgemein:** Lokale Module mit dynamischen Imports (`await import("../core/lancedb.js")`)
immer direkt im Test mocken — nicht nur die npm-Abhängigkeiten in setup.ts.

### 3.5 chokidar v4 — Keine Glob-Strings

```typescript
// FALSCH:
ignored: "**/*.mp3"

// KORREKT:
ignored: (p: string, stats?: fs.Stats) => {
  if (stats?.isDirectory()) return false;
  return !extensions.some((ext) => p.endsWith(ext));
}
```

### 3.6 StreamableHTTPServerTransport — TypeScript-Kompatibilität

```typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

// sessionIdGenerator: undefined ist FALSCH mit exactOptionalPropertyTypes → weglassen:
const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
await server.connect(transport as unknown as Transport);
```

### 3.7 cron — 5-stelliges Pattern (Minuten)

```typescript
new CronJob("*/30 * * * *", callback)  // alle 30 Minuten
new CronJob("0 2 * * *", callback)     // täglich um 02:00
```

### 3.8 Daemon-Spawn — Process detachment

```typescript
const child = spawn("node", [workerPath], { detached: true, stdio: "ignore" });
child.unref(); // kritisch — parent bleibt sonst offen
```

### 3.9 exactOptionalPropertyTypes — TypeScript strict

```typescript
// FALSCH: { sessionIdGenerator: undefined }
// KORREKT: { ...(value !== undefined ? { key: value } : {}) }
```

### 3.10 Anthropic SDK — Prompt Caching

Prompt Caching ist ab ~1024 Tokens rentabel. System-Prompts als `cache_control: { type: "ephemeral" }` markieren.
Response-Typ bei `stream: false`: `message.content[0].type === "text"` → `message.content[0].text`.

```typescript
const message = await client.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 200,
  system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: userPrompt }],
});
const text = message.content[0]?.type === "text" ? message.content[0].text : "";
```

---

## 4 — Offene Punkte aus Phase 1 → Phase 2

### Priorität 1 — Kritisch für Flywheel

| Feature | Datei | Beschreibung |
|---|---|---|
| `last_touchpoint` Update | `src/mcp/tools/log-interaction.ts` | Nach `appendInteraction()` → `matter.stringify` schreibt `last_touchpoint: date` in `main_facts.md` |
| sync-state Persistence | `src/fs/sync-state.ts` (neu) | `.agentic/sync-state.json` — per-Slug Gmail/Calendar Timestamps. Voraussetzung für On-Query-Sync |
| On-Query-Sync | `src/mcp/tools/get-customer-context.ts` | Wenn letzter Sync >30 Min UND OAuth verfügbar: `syncGmail()` fire-and-forget. OAuth via `src/core/oauth-store.ts` |
| LLM-E-Mail-Zusammenfassung | `src/sync/gmail-sync.ts` | Strukturiertes Output: `{ summary, sentiment, nextSteps }` — Fallback ohne API-Key |
| LLM-Kundenerkennung | `src/sync/transcript-watcher.ts` | LLM wählt Slug aus Kandidaten. Kein Match → `.agentic/unmatched-transcripts.json` |

### Priorität 2 — Stabilität

| Feature | Datei | Beschreibung |
|---|---|---|
| `.agentic/unmatched-transcripts.json` | `src/fs/unmatched-transcripts.ts` (neu) | Append-only Queue; `dxcrm status --unmatched` |
| Daemon Rate-Limit-Handling | `src/daemon/worker.ts` | Exponentieller Backoff bei 429; max 50 Kunden/Zyklus; sync-state Update nach jedem Kunden |
| `dxcrm backup schedule` | `src/commands/backup.ts` | `--every day --keep 7` → `.agentic/config.json`; Daemon führt Rolling-Delete durch |
| `dxcrm status` | `src/commands/status.ts` (neu) | Daemon + Sync-Alter + Kunden-Counts + Unmatched |

### Priorität 3 — Phase 2 Core

| Feature | Datei | Beschreibung |
|---|---|---|
| `dxcrm agent spawn` | `src/commands/agent.ts` (neu) | Per-Customer Agent Config; Wake-Trigger im Daemon |
| `dxcrm import` | `src/commands/import.ts` (neu) | HubSpot CSV + generic CSV; Zwei-Pass; LLM-Feld-Mapping |

---

## 5 — Phase 2 Architektur-Entscheidungen

### 5.1 sync-state.json — Schema (definiert, nicht verhandelbar)

```
.agentic/sync-state.json
{
  "acme-corp": { "lastGmailSync": "2026-05-26T07:30:00Z", "lastCalendarSync": "..." },
  "beta-gmbh":  { "lastGmailSync": "2026-05-26T07:31:00Z" }
}
```

Utilities in `src/fs/sync-state.ts`: `readSyncState`, `writeSyncState`, `updateSlugSyncState`, `getLastGmailSync`.

### 5.2 OAuth-Credentials im MCP-Kontext — Singleton-Pattern

Der MCP-Server lädt beim Start Credentials aus `.agentic/`:
```typescript
// src/core/oauth-store.ts
let _auth: Auth.OAuth2Client | null = null;
export async function initOAuthFromDisk(dataDir: string): Promise<boolean>
export function getGmailAuth(): Auth.OAuth2Client | null
export function resetOAuthStore(): void
```

In `src/mcp/server.ts` → `createMcpServer()`: `await initOAuthFromDisk(dataDir)` aufrufen.
Kein IPC. Kein direktes Credential-Passing an MCP-Tools.

### 5.3 On-Query-Sync — Non-blocking Pattern

```typescript
// In get_customer_context tool:
const auth = getGmailAuth();
if (auth) {
  const lastSync = getLastGmailSync(dataDir, targetSlug);
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  if (!lastSync || lastSync < thirtyMinAgo) {
    // Fire-and-forget — NICHT awaiten
    void syncGmail({ slug: targetSlug, dataDir, auth, query })
      .then(() => updateSlugSyncState(dataDir, targetSlug, { lastGmailSync: new Date().toISOString() }))
      .catch(() => {});
  }
}
// Sofort Context bauen und zurückgeben — kein Warten auf Sync
return buildContext(slug);
```

### 5.4 LLM-Integration — Strukturierter Output mit Fallback

Für Phase 2-LLM-Features: **claude-haiku-4-5-20251001** via Anthropic SDK.

```typescript
export interface EmailSummary {
  summary: string;   // 2 Sätze auf Deutsch
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  nextSteps: string[];
}
// Wenn kein ANTHROPIC_API_KEY: Fallback = { summary: snippet.slice(0,300), sentiment: "neutral", nextSteps: [] }
```

Prompt Caching auf System-Prompt: `cache_control: { type: "ephemeral" }`.
Bei JSON-Parse-Fehler oder API-Error → immer Fallback, nie throw.

### 5.5 Agent Spawn — Architektur (einfach halten)

`dxcrm agent spawn acme-corp --channel telegram --wake-on-email` schreibt:
```json
// .agentic/agents/acme-corp.agent.json
{
  "slug": "acme-corp",
  "channel": "telegram",
  "wakeOn": ["email"],
  "createdAt": "2026-05-26T...",
  "lastWake": null
}
```

Daemon (30-Min-Zyklus) liest alle `agents/*.agent.json`. Für jede neue E-Mail seit `lastWake`:
Anthropic API → Antwort-Entwurf → Telegram senden → `lastWake` updaten.

Phase 2 unterstützt: `--channel telegram` only (andere Channels kommen nach User-Feedback).
Telegram-Token via `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` Env-Vars.

### 5.6 Import-Command — sourceRef-Format (definiert)

```
hubspot://activity/<activityId>        → HubSpot-Aktivitäten
hubspot://company/<companyId>          → HubSpot-Companies (für main_facts)
salesforce://task/<taskId>             → Salesforce Tasks
csv://row/<sha256-hash-of-row>         → Generic CSV (Hash für Idempotenz)
```

Import ist idempotent: zweiter Import derselben Datei = 0 neue Einträge.

Zwei-Pass-Architektur:
- Pass 1: Company/Contact-Zeilen → `dxcrm create` für jeden neuen Slug
- Pass 2: Activity-Zeilen → `appendInteraction()` mit korrektem sourceRef

### 5.7 `dxcrm status` — Output-Design

```
─────────────────────────────────────
 DatasynxOpenCRM Status
─────────────────────────────────────
 Daemon:     running (PID 12345)
 Kunden:     3 aktiv
 Syncs:
   acme-corp:  Gmail vor 12 Min
   beta-gmbh:  Gmail vor 2 Std
   startup-ag: noch kein Sync
 Unmatched:  2 Transcripts (dxcrm status --unmatched)
─────────────────────────────────────
```

---

## 6 — Phase 2 Sprint-Plan (Wochen 5–8)

### Woche 5 — Flywheel-Stabilisierung

- [x] `src/fs/sync-state.ts` — sync-state Persistence-Layer
- [x] `src/core/oauth-store.ts` — OAuth-Singleton für MCP
- [x] `last_touchpoint` in `main_facts.md` via `log_interaction()` — `matter.stringify`
- [x] On-Query-Sync in `get_customer_context()` — fire-and-forget
- [x] `src/fs/unmatched-transcripts.ts` — Unmatched-Queue
- [x] `dxcrm status` Command — Daemon + Sync-Alter + Unmatched
- [x] Daemon Rate-Limit-Backoff + max 50 Kunden/Zyklus + sync-state Update
- [x] `dxcrm backup schedule --every day --keep 7`
- [x] Tests für alle obigen (TDD)

**Erledigt wenn:** Daemon läuft 7 Tage ohne manuellen Neustart. `dxcrm status` zeigt echten Zustand.

### Woche 6 — LLM-Integration

- [x] `@anthropic-ai/sdk` installieren
- [x] `src/core/llm.ts` — `summarizeEmail()` + `recognizeCustomer()` mit Prompt Caching
- [x] Gmail-Sync: LLM-Summary (strukturiert) statt raw Snippet
- [x] Transcript-Watcher: LLM-Kundenerkennung → Unmatched bei kein Match
- [ ] Calendar-Sync: LLM-Summary für Kalendereinträge (gleiche Pipeline)
- [x] Fallback wenn kein `ANTHROPIC_API_KEY`
- [x] Tests: `vi.mock("@anthropic-ai/sdk")`

**Erledigt wenn:** `dxcrm sync acme-corp` → interactions.md enthält strukturierte Zusammenfassung + Sentiment.

### Woche 7 — `dxcrm agent spawn` (Teil 1)

- [x] `AgentConfig` Zod-Schema
- [x] `dxcrm agent spawn <slug> --channel telegram --wake-on-email`
- [x] `dxcrm agent status` — zeigt alle aktiven Agenten
- [x] Daemon: Wake-Trigger-Check pro Agent-Config
- [ ] Anthropic API-Call für Antwort-Entwurf

**Erledigt wenn:** Agent-Config wird korrekt in `.agentic/agents/` gespeichert. Daemon-Zyklus erkennt Wake-Events.

### Woche 8 — Telegram + CRM Import

- [x] Telegram-Integration (optional: nur wenn `TELEGRAM_BOT_TOKEN` gesetzt)
- [x] `dxcrm import --from csv ./customers.csv` — zwei Passes
- [x] `dxcrm import --from hubspot ./export/` — zwei Passes, LLM-Feld-Mapping
- [x] `--dry-run` Modus
- [ ] Erster externer User migriert von HubSpot
- [x] README + docs/ für alle Phase-2-Features aktualisiert

**Erledigt wenn:** Ein echter HubSpot-User führt `dxcrm import` aus. Telegram-Nachricht geht raus bei E-Mail-Eingang.

---

## 7 — Nicht bauen in Phase 2 (Trigger fehlt)

| Feature | Trigger |
|---|---|
| Google Drive Sync | "Meine Proposals tauchen nicht auf" |
| Cross-Customer Search | "Welche Kunden erwähnten Konkurrent X?" |
| Multi-User / Team | Zweites Teammitglied will Zugriff |
| Token Compression | User meldet Kontext zu groß |
| Outlook / Teams | Erster Windows-Enterprise-User |
| Windsurf/Cline-spezifische Features | Community-Requests nach 50+ Installationen |
| Plugin-System | Stabiles V1 + 3 Community-Extension-Requests |
| Slack-Integration | "Ich bin nicht auf Telegram" |

---

## 8 — Kritischer Pfad Phase 2

```
[0] sync-state.json Schema  ←── Voraussetzung für On-Query-Sync
     ↓
[A] last_touchpoint Fix ──── [B] On-Query-Sync   (parallel — beide brauchen sync-state)
                                      ↓
                         [C] LLM-Summary + Kundenerkennung
                                      ↓
                         [D] dxcrm agent spawn + Wake-Trigger
                                      ↓
                         [E] Telegram + CRM Import
                                      ↓
                         [F] Externer User migriert von HubSpot
```

`[A]` und `[B]` sind nach `[0]` parallelisierbar. `[C]` braucht keines von beiden.
`[F]` = Flywheel läuft.

---

## 9 — Definitions of Done für Phase 2

```
ERLEDIGT WENN:
Ein User, der dxcrm 30 Tage genutzt hat, hat eine interactions.md
mit 40+ Einträgen — keinen hat er manuell geschrieben.
Sein Agent beantwortet Fragen, die sein früheres HubSpot nicht konnte.
```

Konkret messbar:
- `dxcrm status` zeigt >40 Interaktionen ohne manuellen Eintrag
- `search_customer_knowledge("Was war das letzte Meeting?")` gibt korrektes Datum + LLM-Summary
- `dxcrm agent spawn` → Telegram-Nachricht raus binnen 5 Min nach E-Mail-Eingang
- `dxcrm import --from hubspot` → 0 Fehler auf echten HubSpot-Exports

---

*DatasynxOpenCRM Phase 2 — Das Flywheel dreht sich.*
*Kein täglicher HubSpot-Login. Kein manuelles Update. Kein Rückfragen.*
