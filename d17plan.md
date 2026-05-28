# D17 — Real-Time Push Ingestion: Implementierungsplan

> Basis: plan-next-dxc.md · D17 · Stand: 2026-05-28
> TDD-First. Kein Produktionscode ohne vorherigen Test.
> Baut auf v1 Sync-Infrastruktur auf (gmail-push-watch.ts, webhook-receiver.ts, daemon/worker.ts).

---

## Was D17 liefert

Der qualitative Sprung von *"Polling alle 30 Minuten"* zu *"Echtzeit-Ingestion innerhalb von 60 Sekunden"*.

Bisher läuft der Daemon als Cron-Job und fragt alle Provider aktiv ab. Das bedeutet: Eine neue Mail von Acme Corp landet erst nach bis zu 30 Minuten in der Knowledge Base. Für einen Ambient-Intelligence-CRM ist das zu langsam — der Agent soll auf neue Informationen reagieren können, bevor der Nutzer ihn fragt.

D17 dreht die Richtung um: Die Provider **pushen** neue Events zu dxcrm, sobald sie auftreten.

**Konkret:**

1. **Gmail Pub/Sub** — Google sendet HTTP POST an `/webhooks/gmail` wenn eine neue Mail eintrifft. Handler holt Delta via `fetchNewMessagesFromHistory()`, matched Customer, schreibt Interaction.
2. **Microsoft Graph Webhooks** — MS Graph sendet Änderungs-Notifications an `/webhooks/microsoft`. Handler holt Message-Delta via Graph API.
3. **Slack Events API** — Slack sendet `message` Events an `/webhooks/slack`. Handler extrahiert relevante DMs/Channels.
4. **Subscription Lifecycle** — `push-manager.ts` registriert, erneuert (Gmail: max 7 Tage) und widerruft Subscriptions. Daemon führt täglichen Renewal-Check durch.

**User-sichtbare Änderungen:**
- 2 neue MCP-Tools: `register_push_subscription`, `get_push_status`
- Neue CLI-Commands: `dxcrm push register|status|renew|revoke`
- Neue HTTP-Endpunkte: `POST /webhooks/gmail`, `POST /webhooks/microsoft`, `POST /webhooks/slack`
- Neue Datei: `.agentic/push-subscriptions.json`
- Daemon erhält täglichen Renewal-CronJob

**Was D17 NICHT tut (explizite Grenzen):**
- Kein WebSocket/SSE-Stream für Clients — reine Server-side Ingestion
- Kein Slack Workspace-weites Monitoring (nur konfigurierte Channels/DMs)
- Kein Retry-Backoff für Provider-Outages über 1 Stunde (D20-Aufgabe)
- Keine Echtzeit-Benachrichtigung an Agent-Clients (D20: proactive alerts)
- Kein Pub/Sub Fan-out an mehrere Webhook-URLs
- Kein Google Calendar Push (nur Gmail)

---

## Neue Dateien

```
src/sync/push-manager.ts                        ← Subscription Lifecycle (register, renew, revoke, list)
src/sync/gmail-webhook-handler.ts               ← Gmail Pub/Sub Payload → Interaction
src/sync/microsoft-webhook-handler.ts           ← MS Graph Notification → Interaction
src/sync/slack-webhook-handler.ts               ← Slack Events API → Interaction
src/commands/push.ts                            ← CLI: dxcrm push register|status|renew|revoke

__tests__/sync/push-manager.test.ts
__tests__/sync/gmail-webhook-handler.test.ts
__tests__/sync/microsoft-webhook-handler.test.ts
__tests__/sync/slack-webhook-handler.test.ts
__tests__/commands/push.test.ts
```

## Geänderte Dateien

```
src/mcp/server.ts           ← +2 registerXxx() → 27 tools + 3 POST /webhooks/* Routen
src/mcp/capabilities.ts     ← +2 tools in CAPABILITIES_TEXT
src/cli.ts                  ← +1 pushCommand
src/core/rbac.ts            ← register_push_subscription zu admin ALLOWED_TOOLS
src/daemon/worker.ts        ← +1 CronJob("0 6 * * *") für renewExpiringSubscriptions()
src/fs/sync-state.ts        ← lastGmailPushHistoryId in SlugSyncState
README.md
docs/mcp-tools.md
docs/index.html
```

---

## Daten-Schema

### `.agentic/push-subscriptions.json`

```typescript
interface PushSubscription {
  id: string;                           // "psub_<timestamp>_<random6>"
  provider: "gmail" | "microsoft-graph" | "slack";
  slug: string;                         // Customer-Slug (oder "_all" für global)
  webhookUrl: string;                   // Öffentliche URL für Provider-Callbacks
  expiresAt: string | null;             // ISO — Gmail: 7 Tage, MS Graph: 3 Tage, Slack: null (kein Expiry)
  renewedAt: string | null;             // ISO — letzte Erneuerung
  createdAt: string;                    // ISO
  providerData: {
    // Gmail
    gmailHistoryId?: string;            // Letzter verarbeiteter historyId
    gmailTopicName?: string;            // z.B. "projects/my-project/topics/gmail-push"
    gmailLabelIds?: string[];           // Welche Labels werden überwacht (default: ["INBOX"])
    // Microsoft Graph
    microsoftSubscriptionId?: string;   // Graph subscription ID
    microsoftResource?: string;         // z.B. "/me/mailFolders/Inbox/messages"
    microsoftClientState?: string;      // HMAC verification secret
    // Slack
    slackTeamId?: string;               // Workspace ID
    slackChannelId?: string;            // Spezifischer Channel (optional)
    slackBotToken?: string;             // Für API-Calls nach Event-Empfang
  };
  status: "active" | "expired" | "revoked" | "error";
  lastEventAt: string | null;           // Letzter erfolgreich verarbeiteter Event
  eventsProcessed: number;              // Zähler
}

interface PushSubscriptionsFile {
  subscriptions: PushSubscription[];
  updatedAt: string;
}
```

### `src/fs/sync-state.ts` — Erweiterung

```typescript
interface SlugSyncState {
  lastGmailSync?: string;
  lastCalendarSync?: string;
  lastGmailPushHistoryId?: string;   // NEU — separates Tracking für Push vs. Poll
  lastMicrosoftPushAt?: string;      // NEU — letzter MS Graph Push-Event
}
```

---

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    Provider Side                            │
│                                                             │
│  Gmail ──Pub/Sub──►  POST /webhooks/gmail                   │
│  MS Graph ─────────► POST /webhooks/microsoft               │
│  Slack Events ──────► POST /webhooks/slack                  │
└─────────────────────────────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  HTTP Server│  (src/mcp/server.ts)
                    │  Express    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──┐  ┌──────▼───┐  ┌───▼──────────┐
     │  gmail-   │  │microsoft-│  │  slack-      │
     │  webhook- │  │webhook-  │  │  webhook-    │
     │  handler  │  │handler   │  │  handler     │
     └────────┬──┘  └──────┬───┘  └───┬──────────┘
              │            │          │
              └────────────▼──────────┘
                           │
              ┌────────────▼─────────────┐
              │   matchCustomerByEmail() │  (existing: email-dedup.ts + customers/)
              │   syncGmailHistoryDelta()│  (existing: gmail-push-watch.ts)
              │   appendInteraction()    │  (existing: interactions-writer.ts)
              │   updateGraph()          │  (existing: graph-extractor.ts)
              │   indexToLanceDB()       │  (existing: lancedb.ts)
              └──────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    push-manager.ts                          │
│                                                             │
│  register(provider, slug, opts) → PushSubscription         │
│  renew(subscriptionId) → PushSubscription                   │
│  revoke(subscriptionId) → void                             │
│  listSubscriptions(dataDir) → PushSubscription[]            │
│  renewExpiringSubscriptions(dataDir, thresholdHours=24)    │
│    → findet alle Subs mit expiresAt < now+threshold         │
│    → ruft renew() für jeden auf                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    daemon/worker.ts                         │
│                                                             │
│  (existing) CronJob("*/30 * * * *") — Gmail/MS polling     │
│  (NEW)      CronJob("0 6 * * *")   — renewExpiringSubscriptions()
└─────────────────────────────────────────────────────────────┘
```

---

## Implementierungs-Reihenfolge (TDD-Sequenz)

### Link 1 — Daten-Schicht: `push-manager.ts`

**Tests zuerst** (`__tests__/sync/push-manager.test.ts`):

```typescript
// ~20 Tests
describe("makePushSubId", () => {
  it("returns string starting with psub_")
  it("is unique across calls")
})

describe("readSubscriptions / writeSubscriptions", () => {
  it("returns empty array when file missing")
  it("round-trips subscriptions correctly")
  it("sets updatedAt on write")
})

describe("register", () => {
  it("creates subscription with active status")
  it("sets expiresAt 7 days for gmail")
  it("sets expiresAt 3 days for microsoft-graph")
  it("sets expiresAt null for slack")
  it("appends to existing subscriptions")
  it("returns the new subscription")
})

describe("revoke", () => {
  it("sets status to revoked")
  it("throws if id not found")
})

describe("renewExpiringSubscriptions", () => {
  it("returns empty array when no subscriptions expire within threshold")
  it("identifies subscriptions expiring within 24h")
  it("calls renewFn for each expiring subscription")
  it("updates expiresAt and renewedAt after renewal")
  it("marks subscription as error if renewFn throws")
  it("skips already-revoked subscriptions")
})
```

**Produktionscode** (`src/sync/push-manager.ts`):

```typescript
export type PushProvider = "gmail" | "microsoft-graph" | "slack";
export type PushStatus = "active" | "expired" | "revoked" | "error";

export interface PushSubscription { ... }   // wie oben im Schema

export function makePushSubId(): string {
  return `psub_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function subscriptionsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "push-subscriptions.json");
}

export async function readSubscriptions(dataDir: string): Promise<PushSubscription[]> { ... }
export async function writeSubscriptions(dataDir: string, subs: PushSubscription[]): Promise<void> { ... }

export async function register(
  dataDir: string,
  provider: PushProvider,
  slug: string,
  opts: { webhookUrl: string; providerData?: Partial<PushSubscription["providerData"]> }
): Promise<PushSubscription> { ... }

export async function revoke(dataDir: string, id: string): Promise<void> { ... }

export type RenewFn = (sub: PushSubscription) => Promise<{ expiresAt: string; providerData?: Partial<PushSubscription["providerData"]> }>;

export async function renewExpiringSubscriptions(
  dataDir: string,
  renewFn: RenewFn,
  thresholdHours = 24
): Promise<{ renewed: string[]; errors: string[] }> { ... }
```

**Designentscheid:** `renewFn` ist Dependency Injection — erlaubt testbares Verhalten ohne echte API-Calls. Default-Implementierung (Gmail: ruft `registerGmailWatch()` erneut auf) ist separat in `gmail-webhook-handler.ts`.

---

### Link 2 — Gmail Pub/Sub Handler

**Tests zuerst** (`__tests__/sync/gmail-webhook-handler.test.ts`):

```typescript
// ~18 Tests
describe("decodeGmailPubSubPayload", () => {
  it("decodes base64 message data correctly")
  it("returns null for missing data field")
  it("extracts emailAddress and historyId from decoded payload")
  it("returns null when JSON is malformed")
})

describe("verifyGmailPubSubSignature", () => {
  it("returns true for valid Authorization header with known token")
  it("returns false for missing Authorization header")
  it("returns false for invalid token")
})

describe("handleGmailPushEvent", () => {
  it("calls matchCustomerByEmail and processes history when customer found")
  it("returns { processed: 0 } when email does not match any customer")
  it("updates lastGmailPushHistoryId in sync-state after processing")
  it("calls fetchNewMessagesFromHistory with correct historyId")
  it("skips messages already seen (historyId <= lastProcessed)")
  it("calls appendInteraction for each new message")
  it("increments eventsProcessed counter on subscription")
  it("does not throw on empty history response")
})

describe("buildGmailRenewFn", () => {
  it("returns a RenewFn that calls registerGmailWatch")
  it("renew result contains expiresAt 7 days from now")
  it("renew result contains updated gmailHistoryId")
})
```

**Produktionscode** (`src/sync/gmail-webhook-handler.ts`):

```typescript
export interface GmailPubSubMessage {
  emailAddress: string;
  historyId: string;
}

export function decodeGmailPubSubPayload(body: unknown): GmailPubSubMessage | null { ... }
// body ist raw POST-Body von Pub/Sub:
// { message: { data: "<base64>", messageId, publishTime }, subscription }
// data decoded = JSON: { emailAddress, historyId }

export function verifyGmailPubSubSignature(
  authHeader: string | undefined,
  expectedToken: string
): boolean { ... }

export interface HandleGmailPushOptions {
  fetchHistoryFn?: (accessToken: string, startHistoryId: string) => Promise<HistoryMessage[]>;
  appendInteractionFn?: typeof appendInteraction;
  updateGraphFn?: typeof extractAndUpdateGraph;
}

export async function handleGmailPushEvent(
  dataDir: string,
  payload: GmailPubSubMessage,
  subscriptionId: string,
  options?: HandleGmailPushOptions
): Promise<{ processed: number; slug: string | null }> { ... }

export function buildGmailRenewFn(accessToken: string): RenewFn { ... }
```

**Interne Logik:**
1. `matchCustomerByEmail(emailAddress)` — lädt alle `sources.json`, prüft ob Email zu bekanntem Gmail-Account passt → liefert `slug`
2. Liest `lastGmailPushHistoryId` aus `sync-state.json` für den Slug
3. Wenn `historyId <= lastProcessed` → skip (idempotent)
4. `fetchNewMessagesFromHistory(accessToken, historyId)` — existiert bereits in `gmail-push-watch.ts`
5. Für jede Message: `appendInteraction()` + `extractAndUpdateGraph()`
6. Schreibt neuen `lastGmailPushHistoryId`
7. Inkrementiert `eventsProcessed` in Subscription

---

### Link 3 — Microsoft Graph Webhook Handler

**Tests zuerst** (`__tests__/sync/microsoft-webhook-handler.test.ts`):

```typescript
// ~14 Tests
describe("verifyMicrosoftGraphSignature", () => {
  it("returns true when clientState in body matches stored secret")
  it("returns false for mismatched clientState")
  it("returns false for missing clientState")
})

describe("handleMicrosoftValidationRequest", () => {
  it("detects validationToken query param (Graph handshake)")
  it("returns { isValidation: true, token } when validationToken present")
  it("returns { isValidation: false } when no validationToken")
})

describe("handleMicrosoftPushEvent", () => {
  it("processes value[] array from Graph notification body")
  it("fetches message by messageId for each notification")
  it("matches customer by sender email")
  it("calls appendInteraction for matched customers")
  it("returns { processed, skipped } counts")
  it("skips notification when no customer matched")
  it("handles empty value array gracefully")
})
```

**Produktionscode** (`src/sync/microsoft-webhook-handler.ts`):

```typescript
export interface MicrosoftGraphNotification {
  subscriptionId: string;
  clientState: string;
  resource: string;
  resourceData?: { id: string; "@odata.type": string };
}

export function verifyMicrosoftGraphSignature(
  body: { value?: MicrosoftGraphNotification[] },
  expectedClientState: string
): boolean { ... }

export interface ValidationResult {
  isValidation: boolean;
  token?: string;
}

export function handleMicrosoftValidationRequest(
  queryParams: Record<string, string | undefined>
): ValidationResult { ... }
// MS Graph sendet GET /webhooks/microsoft?validationToken=xxx beim Setup
// Handler muss validationToken plain/text zurückspiegeln

export interface HandleMicrosoftPushOptions {
  fetchMessageFn?: (accessToken: string, messageId: string) => Promise<GraphMessage | null>;
  appendInteractionFn?: typeof appendInteraction;
}

export async function handleMicrosoftPushEvent(
  dataDir: string,
  notifications: MicrosoftGraphNotification[],
  accessToken: string,
  options?: HandleMicrosoftPushOptions
): Promise<{ processed: number; skipped: number }> { ... }
```

**Besonderheit:** MS Graph sendet beim Erstellen einer Subscription eine Validation Request (GET mit `validationToken`). Server muss diesen Token unverändert als `text/plain` antworten. Dieser Handshake muss im Express-Handler abgefangen werden.

---

### Link 4 — Slack Events API Handler

**Tests zuerst** (`__tests__/sync/slack-webhook-handler.test.ts`):

```typescript
// ~12 Tests
describe("verifySlackSignature", () => {
  it("returns true for valid HMAC-SHA256 with correct secret")
  it("returns false for invalid signature")
  it("returns false for missing X-Slack-Signature header")
  it("returns false for timestamp > 5 minutes old (replay protection)")
})

describe("handleSlackUrlVerification", () => {
  it("detects url_verification event type")
  it("returns challenge string for url_verification")
  it("returns null for non-verification events")
})

describe("handleSlackPushEvent", () => {
  it("processes message events")
  it("extracts user, text, channel, ts from event")
  it("matches customer by Slack user ID in sources.json")
  it("skips bot messages (bot_id present)")
  it("skips messages with no text")
  it("calls appendInteraction for matched customer")
  it("returns { processed, skipped }")
})
```

**Produktionscode** (`src/sync/slack-webhook-handler.ts`):

```typescript
export function verifySlackSignature(
  body: string,
  headers: { "x-slack-signature"?: string; "x-slack-request-timestamp"?: string },
  signingSecret: string
): boolean { ... }
// Algo: "v0=" + HMAC-SHA256("v0:<timestamp>:<body>", signingSecret)

export interface SlackUrlVerificationResult {
  isVerification: boolean;
  challenge?: string;
}

export function handleSlackUrlVerification(body: { type?: string; challenge?: string }): SlackUrlVerificationResult { ... }

export interface SlackEvent {
  type: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  bot_id?: string;
}

export interface HandleSlackPushOptions {
  appendInteractionFn?: typeof appendInteraction;
  fetchUserInfoFn?: (botToken: string, userId: string) => Promise<{ email?: string; name?: string }>;
}

export async function handleSlackPushEvent(
  dataDir: string,
  event: SlackEvent,
  botToken: string,
  options?: HandleSlackPushOptions
): Promise<{ processed: number; skipped: number }> { ... }
```

---

### Link 5 — HTTP Server: Webhook-Routen

**Änderung in `src/mcp/server.ts`**:

```typescript
// Bestehend:
app.post("/mcp", ...);
app.get("/health", ...);

// NEU:
app.post("/webhooks/gmail", express.json(), async (req, res) => {
  const sig = req.headers["authorization"] as string | undefined;
  const token = process.env["GMAIL_PUBSUB_TOKEN"] ?? "";
  if (!verifyGmailPubSubSignature(sig, token)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const payload = decodeGmailPubSubPayload(req.body);
  if (!payload) { res.status(400).json({ error: "invalid_payload" }); return; }
  const result = await handleGmailPushEvent(dataDir, payload, "");
  res.json({ ok: true, processed: result.processed });
});

app.all("/webhooks/microsoft", express.json(), async (req, res) => {
  // Handle GET validation handshake
  const validation = handleMicrosoftValidationRequest(req.query as Record<string, string>);
  if (validation.isValidation) {
    res.setHeader("content-type", "text/plain");
    res.status(200).send(validation.token);
    return;
  }
  // Handle POST notifications
  const clientState = process.env["MS_GRAPH_CLIENT_STATE"] ?? "";
  const body = req.body as { value?: MicrosoftGraphNotification[] };
  if (!verifyMicrosoftGraphSignature(body, clientState)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const accessToken = /* load from .agentic/microsoft-token.json */ "";
  const result = await handleMicrosoftPushEvent(dataDir, body.value ?? [], accessToken);
  res.json({ ok: true, ...result });
});

app.post("/webhooks/slack", express.text({ type: "*/*" }), async (req, res) => {
  const signingSecret = process.env["SLACK_SIGNING_SECRET"] ?? "";
  if (!verifySlackSignature(req.body as string, req.headers as any, signingSecret)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = JSON.parse(req.body as string);
  const verification = handleSlackUrlVerification(body);
  if (verification.isVerification) {
    res.json({ challenge: verification.challenge });
    return;
  }
  const botToken = process.env["SLACK_BOT_TOKEN"] ?? "";
  const result = await handleSlackPushEvent(dataDir, body.event, botToken);
  res.json({ ok: true, ...result });
});
```

**Kein separater Test für den Express-Layer** — Handler-Funktionen sind vollständig getestet. Integration-Test für den Server würde echte HTTP-Calls benötigen und fällt in E2E-Scope (D20).

---

### Link 6 — MCP-Tools

**`register_push_subscription`** — Registriert Subscription für einen Customer-Slug

Input-Schema:
```typescript
{
  provider: z.enum(["gmail", "microsoft-graph", "slack"]),
  slug: z.string(),
  webhookUrl: z.string().url(),
  gmailTopicName: z.string().optional(),      // required für gmail
  microsoftResource: z.string().optional(),   // required für microsoft-graph
  microsoftClientState: z.string().optional(),
  slackTeamId: z.string().optional(),
  slackChannelId: z.string().optional(),
}
```

Output: `{ subscriptionId, provider, slug, expiresAt, status }`

RBAC: `admin` only (Infra-Entscheidung)

---

**`get_push_status`** — Zeigt alle aktiven Subscriptions

Input-Schema:
```typescript
{
  slug: z.string().optional(),          // Filter by customer (optional)
  provider: z.enum(["gmail", "microsoft-graph", "slack"]).optional(),
}
```

Output:
```typescript
{
  subscriptions: Array<{
    id: string;
    provider: string;
    slug: string;
    status: string;
    expiresAt: string | null;
    expiresInHours: number | null;    // null wenn kein Expiry
    lastEventAt: string | null;
    eventsProcessed: number;
    needsRenewal: boolean;            // true wenn expiresInHours < 24
  }>;
  summary: {
    total: number;
    active: number;
    expiringSoon: number;
    expired: number;
  };
}
```

RBAC: `any`

---

### Link 7 — CLI: `dxcrm push`

**`src/commands/push.ts`**:

```
dxcrm push register --provider gmail --slug acme-corp --webhook-url https://... --topic projects/x/topics/y
dxcrm push register --provider microsoft --slug acme-corp --webhook-url https://... --client-state <secret>
dxcrm push register --provider slack --slug acme-corp --webhook-url https://... --team-id T12345
dxcrm push status [--slug acme-corp] [--provider gmail]
dxcrm push renew [--all] [--id psub_xxx]
dxcrm push revoke --id psub_xxx
```

---

### Link 8 — Daemon Extension

**`src/daemon/worker.ts`** — neuer CronJob:

```typescript
// täglich um 06:00
new CronJob("0 6 * * *", async () => {
  try {
    await renewExpiringSubscriptions(dataDir, buildDefaultRenewFn(dataDir));
  } catch (err) {
    console.error("[push] renewal failed:", err);
  }
}, null, true);
```

`buildDefaultRenewFn(dataDir)` — wählt passende RenewFn je nach Provider:
- Gmail → `buildGmailRenewFn(accessToken)`
- Microsoft → ruft Graph Subscription PATCH auf
- Slack → kein Expiry, Noop

---

### Link 9 — Dokumentation

**Commit-Checkliste:**
- `src/mcp/capabilities.ts` — +2 Tool-Einträge
- `README.md` — +Push CLI Table, +2 MCP Tool Rows, +2 JSON Examples
- `docs/mcp-tools.md` — +2 Tool Sections + Workflow
- `docs/index.html` — nav count 25→27, +2 Sections

---

## Test-Übersicht

| Datei | Tests |
|---|---|
| `push-manager.test.ts` | ~20 |
| `gmail-webhook-handler.test.ts` | ~18 |
| `microsoft-webhook-handler.test.ts` | ~14 |
| `slack-webhook-handler.test.ts` | ~12 |
| `commands/push.test.ts` | ~10 |
| **Total neu** | **~74** |
| Gesamt nach D17 | **~1298** |

---

## Abgrenzung zu anderen Dominos

| | D17 (Push Ingestion) | D20 (Proactive Agent) |
|---|---|---|
| Richtung | Provider → dxcrm (inbound) | dxcrm → User (outbound) |
| Trigger | Provider-Push-Event | Cron + Event-Pattern |
| Output | Interaction in Markdown | Alert / Summary an User |
| Abhängigkeit | v1 Sync-Infra | D17 (Events als Input) |

D17 ist bewusst **nur Ingestion**. Die Reaktion auf ingested Events (z.B. "neuer Mail von Champion → Alert senden") ist D20.

---

## Umgebungsvariablen (neu in D17)

```bash
GMAIL_PUBSUB_TOKEN=<token>          # Shared secret für Pub/Sub Authorization-Header
MS_GRAPH_CLIENT_STATE=<secret>      # HMAC-Shared-Secret für Graph Notifications
SLACK_SIGNING_SECRET=<secret>       # Für HMAC-SHA256 Verification
SLACK_BOT_TOKEN=xoxb-...            # Für User-Info Lookups nach Event
```

Werden in `.agentic/sources.json` oder `.env` gespeichert (existierendes Pattern aus v1).

---

## Risiken und Mitigationen

| Risiko | Mitigation |
|---|---|
| Gmail Watch läuft ab (7 Tage) | Renewal-CronJob täglich 06:00 + `needsRenewal` Flag im Status-Tool |
| Webhook URL nicht öffentlich erreichbar (lokale Dev) | Docs: `ngrok http 3847` als Dev-Tunnel; CLI gibt Warnung wenn URL `localhost` enthält |
| Pub/Sub Duplicate Delivery | `historyId <= lastProcessed` Check + `sourceRef` Dedup in interactions.md |
| MS Graph Validation Handshake muss < 10s antworten | Express-Handler ist synchron für Validation-Branch, kein async |
| Slack Replay-Angriffe | `x-slack-request-timestamp` älter als 5 Minuten → reject |
| Slack URL-Verification Challenge muss sofort beantwortet werden | Synchroner Handler-Branch, kein DB-Lookup |

---

## Implementierungsreihenfolge (strikt TDD)

```
1. __tests__/sync/push-manager.test.ts           → src/sync/push-manager.ts
2. __tests__/sync/gmail-webhook-handler.test.ts  → src/sync/gmail-webhook-handler.ts
3. __tests__/sync/microsoft-webhook-handler.test.ts → src/sync/microsoft-webhook-handler.ts
4. __tests__/sync/slack-webhook-handler.test.ts  → src/sync/slack-webhook-handler.ts
5. __tests__/mcp/tools/register-push.test.ts     → src/mcp/tools/register-push-subscription.ts
6. __tests__/mcp/tools/get-push-status.test.ts   → src/mcp/tools/get-push-status.ts
7. __tests__/commands/push.test.ts               → src/commands/push.ts
8. src/mcp/server.ts                             (Webhook-Routen, kein separater Test)
9. src/daemon/worker.ts                          (Renewal-CronJob)
10. Docs: capabilities.ts, README.md, docs/      
```

Jeder Schritt: Test schreibt → roten Test bestätigen → Produktionscode → grünen Test bestätigen → weiter.
