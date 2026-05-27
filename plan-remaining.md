# DatasynxOpenCRM — Restliche Domino-Steine (Plan v5)

> Stand: 2026-05-27 | Basis: plan-enterprise.md v4 + Ist-Zustand nach E1–E6
> Alle bereits erledigten Items aus E1–E6 sind **nicht** in diesem Dokument.

---

## Ist-Stand nach E1–E6

### ✅ Fertig (673 Tests, main gemerged)

| Bereich | Was fertig ist |
|---|---|
| RBAC | enforceRbac() in allen 3 Write-Tools, rep kann update_deal |
| GDPR | LanceDB dropCustomerTable bei Erasure |
| Encryption | AES-256-GCM field-level encryption |
| Rate Limiter | Exponential backoff, RateLimiter class |
| Plugin System | DxcrmPlugin interface, Registry, `dxcrm plugin` CLI |
| CRM Konnektoren | Dynamics, Zoho, Monday, Freshsales, Zendesk, SugarCRM, Copper |
| Salesforce | Bulk API v2 (async jobs, Sforce-Locator) |
| Pipedrive | v2 cursor pagination |
| Microsoft | Calendar sync (calendarView+nextLink), Teams Transcripts |
| Google Meet | REST v2 Transcript sync |
| MCP Tools | get_deal_health, get_pipeline_forecast, summarize_meeting |

### ❌ Noch offen

| Item | Domino | Priorität |
|---|---|---|
| HubSpot v4 Associations Connector | 7 | **Hoch** |
| Gmail full-body + Push Watch | 6 | **Hoch** |
| Webhook Receiver Framework | 8 | **Hoch** |
| Custom Pipeline Stages per Team | 8 | **Hoch** |
| Email Threading + Deduplication | 9 | Mittel |
| 3 First-Party Plugins (Slack, Stripe, Linear) | 10 | Mittel |
| Google Drive Attachment Sync | 6 | Mittel |
| Cross-Customer Intelligence | 9 | Niedrig |
| SSO / SAML 2.0 | 8 | Niedrig (WorkOS Fallback) |
| Multi-Tenant SaaS / PostgreSQL RLS | 10 | Optional |

---

## Sprint R1 — HubSpot v4 + Gmail Push Watch (2 Wochen)

### R1.1 HubSpot v4 Connector

**Datei:** `src/sync/connectors/hubspot.ts`

HubSpot ist der wichtigste fehlende Konnektor (größtes Marktvolumen).

#### API-Spezifikation

**Contacts (cursor pagination):**
```
GET /crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,phone,company&after=<cursor>
Headers: Authorization: Bearer <token>
Response: { results: [...], paging: { next: { after: "cursor" } } }
```

**Associations v4 (Activity History):**
```
GET /crm/v4/objects/contacts/{contactId}/associations/notes?limit=500
GET /crm/v4/objects/contacts/{contactId}/associations/calls?limit=500
GET /crm/v4/objects/contacts/{contactId}/associations/emails?limit=500
GET /crm/v4/objects/contacts/{contactId}/associations/meetings?limit=500
Response: { results: [{ toObjectId, associationTypes }], paging: { next: { after } } }
```

**Activity detail fetch:**
```
GET /crm/v3/objects/notes/{id}?properties=hs_note_body,hs_timestamp
GET /crm/v3/objects/calls/{id}?properties=hs_call_body,hs_call_duration,hs_timestamp
GET /crm/v3/objects/emails/{id}?properties=hs_email_subject,hs_email_text,hs_timestamp
GET /crm/v3/objects/meetings/{id}?properties=hs_meeting_title,hs_meeting_body,hs_timestamp
```

**Rate Limits:** 100 req/10s (kostenfrei), 150 req/10s (Pro). Retry auf 429.

**HubSpot Async Export API (für Bulk):**
```
POST /crm/v3/exports/export/async
Body: { exportType: "LIST", format: "CSV", exportName: "contacts", objectType: "CONTACTS", ... }
→ { id: "job-id" }

GET /crm/v3/exports/export/async/tasks/{id}/status
→ { status: "COMPLETE" | "PROCESSING" | "PENDING" | "FAILED", result: { fileId } }

GET /files/v3/files/{fileId}/signed-url
→ Download CSV
```

#### Implementation

```typescript
// src/sync/connectors/hubspot.ts
import type { CrmConnector, CrmContact, CrmActivity } from "./index.js";
import { RateLimiter } from "../../core/rate-limiter.js";

interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
}

interface HubSpotAssociation {
  toObjectId: number;
}

interface HubSpotActivity {
  id: string;
  properties: {
    hs_note_body?: string;
    hs_call_body?: string;
    hs_email_subject?: string;
    hs_email_text?: string;
    hs_meeting_title?: string;
    hs_meeting_body?: string;
    hs_timestamp?: string;
    hs_call_duration?: string;
  };
}

type HubSpotObjectType = "notes" | "calls" | "emails" | "meetings";

const limiter = new RateLimiter({ maxRetries: 4, baseDelayMs: 1000 });

async function hubspotGet<T>(
  token: string,
  path: string
): Promise<T> {
  return limiter.execute(async () => {
    const res = await fetch(`https://api.hubapi.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) throw new Error("429 rate limit");
    if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`);
    return res.json() as Promise<T>;
  });
}

async function* fetchContacts(token: string): AsyncGenerator<CrmContact> {
  let after: string | undefined;
  do {
    const params = new URLSearchParams({
      limit: "100",
      properties: "firstname,lastname,email,phone,company",
    });
    if (after) params.set("after", after);

    const data = await hubspotGet<{
      results: HubSpotContact[];
      paging?: { next?: { after?: string } };
    }>(token, `/crm/v3/objects/contacts?${params}`);

    for (const c of data.results) {
      const { firstname = "", lastname = "", email, phone, company } = c.properties;
      yield {
        id: c.id,
        name: `${firstname} ${lastname}`.trim() || "Unknown",
        email,
        phone,
        company,
      };
    }
    after = data.paging?.next?.after;
  } while (after);
}

async function* fetchAssociatedActivities(
  token: string,
  contactId: string,
  objectType: HubSpotObjectType
): AsyncGenerator<CrmActivity> {
  let after: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (after) params.set("after", after);

    const assocData = await hubspotGet<{
      results: HubSpotAssociation[];
      paging?: { next?: { after?: string } };
    }>(token, `/crm/v4/objects/contacts/${contactId}/associations/${objectType}?${params}`);

    for (const assoc of assocData.results) {
      const propMap: Record<HubSpotObjectType, string> = {
        notes: "hs_note_body,hs_timestamp",
        calls: "hs_call_body,hs_call_duration,hs_timestamp",
        emails: "hs_email_subject,hs_email_text,hs_timestamp",
        meetings: "hs_meeting_title,hs_meeting_body,hs_timestamp",
      };
      const detail = await hubspotGet<{ id: string; properties: HubSpotActivity["properties"] }>(
        token,
        `/crm/v3/objects/${objectType}/${assoc.toObjectId}?properties=${propMap[objectType]}`
      );

      const typeMap: Record<HubSpotObjectType, CrmActivity["type"]> = {
        notes: "Note",
        calls: "Call",
        emails: "Email",
        meetings: "Meeting",
      };

      const notes =
        detail.properties.hs_note_body ??
        detail.properties.hs_call_body ??
        detail.properties.hs_email_text ??
        detail.properties.hs_meeting_body;

      const subject =
        detail.properties.hs_email_subject ?? detail.properties.hs_meeting_title;

      yield {
        id: `hubspot-${objectType}-${detail.id}`,
        contactId,
        type: typeMap[objectType],
        subject,
        notes,
        date: detail.properties.hs_timestamp
          ? new Date(detail.properties.hs_timestamp).toISOString().slice(0, 10)
          : undefined,
      };
    }
    after = assocData.paging?.next?.after;
  } while (after);
}

export const HubSpotConnector: CrmConnector = {
  name: "HubSpot",

  async *fetchContacts(token: string, _instanceUrl: string): AsyncGenerator<CrmContact> {
    yield* fetchContacts(token);
  },

  async *fetchActivities(token: string, _instanceUrl: string): AsyncGenerator<CrmActivity> {
    // Fetch all contacts first, then stream activities per contact
    // (In practice: pass contactId via instanceUrl or use a different calling convention)
    // For batch export, use HubSpot Async Export API — see hubspot-bulk-export.ts
    for await (const contact of fetchContacts(token)) {
      for (const objectType of ["notes", "calls", "emails", "meetings"] as HubSpotObjectType[]) {
        yield* fetchAssociatedActivities(token, contact.id, objectType);
      }
    }
  },
};
```

**Tests:** `__tests__/sync/connectors/hubspot.test.ts`
- fetchContacts: cursor pagination, empty response
- fetchActivities: associations v4 fetching, all 4 types (notes/calls/emails/meetings)
- Rate limit retry (429 → retry → success)
- Detail fetch: correct type mapping

---

### R1.2 Gmail Full-Body + Push Watch

**Datei:** `src/sync/gmail-push-watch.ts`

Das aktuelle `gmail-sync.ts` verwendet nur `snippet` (150 Zeichen). Benötigt wird:
1. Vollständiger E-Mail-Body (MIME parsing)
2. Push Notifications via Cloud Pub/Sub statt Polling

#### Gmail Full-Body Fetch

```typescript
// Extend gmail-sync.ts — add full body fetch
GET https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=full
Response: {
  id, threadId,
  payload: {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: "<base64url>" } },
      { mimeType: "text/html",  body: { data: "<base64url>" } }
    ]
  }
}
```

**MIME Parsing:**
```typescript
function extractBody(payload: GmailPayload): string {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
  }
  // Recurse into multipart
  for (const part of payload.parts ?? []) {
    const body = extractBody(part);
    if (body) return body;
  }
  return "";
}
```

#### Gmail Push Watch (historyId-based)

```typescript
// src/sync/gmail-push-watch.ts
// Step 1: Subscribe to push notifications
POST https://gmail.googleapis.com/gmail/v1/users/me/watch
Body: {
  topicName: "projects/{project}/topics/{topic}",
  labelIds: ["INBOX"]
}
Response: { historyId: "12345", expiration: "1234567890000" }

// Step 2: Pub/Sub delivers to webhook
POST /webhooks/gmail
Body: {
  message: {
    data: "<base64url of { emailAddress, historyId }>",
    messageId: "...",
    publishTime: "..."
  }
}

// Step 3: Incremental sync from historyId
GET https://gmail.googleapis.com/gmail/v1/users/me/history
  ?startHistoryId={lastKnownHistoryId}
  &historyTypes=messageAdded
Response: {
  history: [{ messages: [{ id, threadId }] }],
  historyId: "12346"
}
```

**Dateien:**
- `src/sync/gmail-push-watch.ts` — Watch-Registration + historyId sync
- `src/sync/gmail-webhook-handler.ts` — Pub/Sub Webhook Handler
- Speicherung von `historyId` in `.agentic/sync-state.json`

**Tests:** `__tests__/sync/gmail-push-watch.test.ts`
- extractBody: plain text, multipart, nested multipart
- historyId-basiertes inkrementelles Sync
- Webhook Payload decoding (base64url)

---

## Sprint R2 — Webhook Receiver + Custom Pipeline Stages (2 Wochen)

### R2.1 Webhook Receiver Framework

**Datei:** `src/core/webhook-receiver.ts`

Zentrales Framework für alle eingehenden Webhooks (Gmail Pub/Sub, HubSpot, Stripe, etc.).

#### Design

```typescript
// src/core/webhook-receiver.ts
export interface WebhookHandler {
  provider: string;
  path: string;           // e.g. "/webhooks/gmail"
  verifySignature?(req: IncomingWebhookRequest): boolean;
  handle(payload: unknown): Promise<void>;
}

export interface IncomingWebhookRequest {
  headers: Record<string, string>;
  rawBody: Buffer;
  body: unknown;
}

// HMAC verification helper
export function verifyHmacSha256(
  secret: string,
  payload: Buffer,
  signature: string, // "sha256=<hex>"
  headerName = "X-Hub-Signature-256"
): boolean {
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// In-memory queue (BullMQ optional, defaults to simple array for self-hosted)
class WebhookQueue {
  private queue: Array<{ handler: WebhookHandler; payload: unknown }> = [];
  private processing = false;

  enqueue(handler: WebhookHandler, payload: unknown): void {
    this.queue.push({ handler, payload });
    if (!this.processing) this.drain();
  }

  private async drain(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await item.handler.handle(item.payload);
      } catch (err) {
        process.stderr.write(`[webhook] handler error: ${(err as Error).message}\n`);
      }
    }
    this.processing = false;
  }
}

export const webhookQueue = new WebhookQueue();

// Provider-specific signature verifiers
export const SIGNATURE_VERIFIERS: Record<string, (req: IncomingWebhookRequest, secret: string) => boolean> = {
  github: (req, secret) => verifyHmacSha256(secret, req.rawBody, req.headers["x-hub-signature-256"] ?? ""),
  hubspot: (req, secret) => verifyHmacSha256(secret, req.rawBody, req.headers["x-hubspot-signature-v3"] ?? ""),
  stripe: (req, secret) => {
    // Stripe uses timestamp + signature format
    const header = req.headers["stripe-signature"] ?? "";
    const ts = header.match(/t=(\d+)/)?.[1];
    const sig = header.match(/v1=([a-f0-9]+)/)?.[1];
    if (!ts || !sig) return false;
    const payload = Buffer.from(`${ts}.${req.rawBody.toString()}`);
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return sig === expected;
  },
  linear: (req, secret) => verifyHmacSha256(secret, req.rawBody, req.headers["linear-signature"] ?? ""),
};
```

**Express-Integration:**
```typescript
// src/commands/server.ts — add webhook routes
app.post("/webhooks/:provider", express.raw({ type: "*/*" }), (req, res) => {
  res.status(200).json({ ok: true }); // Sofort 200, async processing
  
  const provider = req.params.provider;
  const secret = process.env[`DXCRM_WEBHOOK_SECRET_${provider.toUpperCase()}`];
  
  if (secret) {
    const verifier = SIGNATURE_VERIFIERS[provider];
    if (verifier && !verifier({ headers: req.headers as Record<string,string>, rawBody: req.body, body: undefined }, secret)) {
      process.stderr.write(`[webhook] invalid signature for ${provider}\n`);
      return;
    }
  }
  
  const handler = registeredHandlers.get(provider);
  if (handler) webhookQueue.enqueue(handler, JSON.parse(req.body.toString()));
});
```

**Tests:** `__tests__/core/webhook-receiver.test.ts`
- verifyHmacSha256: correct signature passes, tampered payload fails
- Stripe signature format parsing
- WebhookQueue: async processing, error isolation
- Provider verifiers registered correctly

---

### R2.2 Custom Pipeline Stages per Team

**Dateien:**
- `src/core/pipeline-stages.ts`
- `src/commands/pipeline-stages.ts`
- `src/mcp/tools/get-pipeline-stages.ts`

#### Schema

```typescript
// src/core/pipeline-stages.ts
export interface PipelineStage {
  id: string;               // slug, e.g. "demo-booked"
  label: string;            // Display name, e.g. "Demo Booked"
  color?: string;           // Hex color, e.g. "#3B82F6"
  order: number;            // Sort order
  isFinal?: boolean;        // True for "won"/"lost" equivalents
  probability?: number;     // Default win probability (0-100)
}

export const DEFAULT_STAGES: PipelineStage[] = [
  { id: "lead",        label: "Lead",        order: 1, probability: 10 },
  { id: "qualified",   label: "Qualified",   order: 2, probability: 30 },
  { id: "proposal",    label: "Proposal",    order: 3, probability: 50 },
  { id: "negotiation", label: "Negotiation", order: 4, probability: 75 },
  { id: "won",         label: "Won",         order: 5, isFinal: true, probability: 100 },
  { id: "lost",        label: "Lost",        order: 6, isFinal: true, probability: 0 },
];

function stagesPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "pipeline-stages.json");
}

export function getPipelineStages(dataDir: string): PipelineStage[] {
  const p = stagesPath(dataDir);
  if (!fs.existsSync(p)) return DEFAULT_STAGES;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8") as string) as PipelineStage[];
  } catch {
    return DEFAULT_STAGES;
  }
}

export function setPipelineStage(dataDir: string, stage: PipelineStage): void {
  const stages = getPipelineStages(dataDir);
  const idx = stages.findIndex((s) => s.id === stage.id);
  if (idx >= 0) stages[idx] = stage;
  else stages.push(stage);
  stages.sort((a, b) => a.order - b.order);
  fs.mkdirSync(path.dirname(stagesPath(dataDir)), { recursive: true });
  fs.writeFileSync(stagesPath(dataDir), JSON.stringify(stages, null, 2));
}

export function deletePipelineStage(dataDir: string, id: string): void {
  const stages = getPipelineStages(dataDir).filter((s) => s.id !== id);
  fs.writeFileSync(stagesPath(dataDir), JSON.stringify(stages, null, 2));
}
```

**CLI:** `dxcrm stages list | set <id> <label> [--order N] [--probability N] | delete <id>`

**MCP-Tool:** `get_pipeline_stages()` → gibt alle konfigurierten Stages zurück

**Tests:** `__tests__/core/pipeline-stages.test.ts`
- getPipelineStages: default wenn keine Datei
- setPipelineStage: neuer Stage, update bestehender
- deletePipelineStage
- Sort by order
- `__tests__/mcp/tools/get-pipeline-stages.test.ts`

---

## Sprint R3 — Email Threading + Deduplication (2 Wochen)

### R3.1 Email Thread Detection

**Datei:** `src/sync/email-dedup.ts`

Verhindert Duplikate bei mehrfachen Sync-Läufen und gruppiert E-Mails zu Threads.

#### Algorithmik

```typescript
// src/sync/email-dedup.ts
import crypto from "crypto";

export interface EmailRef {
  messageId?: string;   // RFC 2822 Message-ID
  threadId?: string;    // Gmail/Graph threadId
  subject?: string;     // Normalized subject
  from?: string;
  date?: string;
}

function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/^(re:|fwd?:|aw:|wg:)\s*/gi, "")
    .trim();
}

export function deduplicateRefs(refs: EmailRef[]): string {
  // Primary: messageId (globally unique)
  if (refs[0]?.messageId) return `msgid://${refs[0].messageId}`;
  // Secondary: threadId
  if (refs[0]?.threadId) return `thread://${refs[0].threadId}`;
  // Fallback: hash of normalized subject + from + date
  const key = `${normalizeSubject(refs[0]?.subject ?? "")}_${refs[0]?.from ?? ""}_${refs[0]?.date ?? ""}`;
  return `hash://${crypto.createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

export function isLikelySameThread(a: EmailRef, b: EmailRef): boolean {
  if (a.threadId && b.threadId) return a.threadId === b.threadId;
  if (a.messageId && b.messageId) return a.messageId === b.messageId;
  return normalizeSubject(a.subject ?? "") === normalizeSubject(b.subject ?? "")
    && a.from === b.from;
}

// Check if sourceRef is already in interactions file
export function isAlreadySynced(existing: string, sourceRef: string): boolean {
  return existing.includes(sourceRef);
}
```

**Integration:** `gmail-sync.ts` und `microsoft-sync.ts` nutzen `deduplicateRefs()` statt des rohen Message-IDs als sourceRef.

**Tests:** `__tests__/sync/email-dedup.test.ts`
- normalizeSubject: Re: / Fwd: / AW: werden entfernt
- deduplicateRefs: messageId → thread → hash
- isLikelySameThread: threadId > messageId > subject+from
- isAlreadySynced: exact match

---

## Sprint R4 — First-Party Plugins (3 Wochen)

### R4.1 Slack Plugin

**Datei:** `src/plugins/slack.ts`

```typescript
// src/plugins/slack.ts
import type { DxcrmPlugin } from "../core/plugin-registry.js";

export interface SlackPluginConfig {
  webhookUrl: string;
  channel?: string;
  notifyOn: Array<"new_interaction" | "deal_won" | "deal_lost" | "new_customer">;
}

async function sendSlackMessage(webhookUrl: string, text: string, blocks?: unknown[]): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...(blocks ? { blocks } : {}) }),
  });
}

export function createSlackPlugin(config: SlackPluginConfig): DxcrmPlugin {
  return {
    name: "slack",
    version: "1.0.0",
    description: "Slack notifications for CRM events",
    mcpTools: [],

    async onInstall() {
      await sendSlackMessage(config.webhookUrl, "✅ DatasynxOpenCRM Slack plugin installed.");
    },

    // Hook: after log_interaction
    async afterLogInteraction(slug: string, summary: string): Promise<void> {
      if (!config.notifyOn.includes("new_interaction")) return;
      await sendSlackMessage(
        config.webhookUrl,
        `📝 New interaction logged for *${slug}*: ${summary.slice(0, 200)}`
      );
    },

    // Hook: after update_deal (stage=won/lost)
    async afterDealUpdate(slug: string, dealName: string, stage: string): Promise<void> {
      if (stage === "won" && config.notifyOn.includes("deal_won")) {
        await sendSlackMessage(config.webhookUrl, `🎉 Deal WON: *${dealName}* for ${slug}`);
      }
      if (stage === "lost" && config.notifyOn.includes("deal_lost")) {
        await sendSlackMessage(config.webhookUrl, `❌ Deal LOST: *${dealName}* for ${slug}`);
      }
    },
  };
}
```

**Config:** `DXCRM_SLACK_WEBHOOK_URL` env var + `.agentic/plugins/slack.json`

**Tests:** `__tests__/plugins/slack.test.ts`
- createSlackPlugin: konfigurierbar
- afterLogInteraction: sendet Nachricht wenn notifyOn includes new_interaction
- afterDealUpdate: won/lost trigger korrekt

---

### R4.2 Stripe Plugin

**Datei:** `src/plugins/stripe.ts`

Verknüpft CRM-Kunden mit Stripe-Subscriptions und Invoices.

```typescript
// src/plugins/stripe.ts
import type { DxcrmPlugin } from "../core/plugin-registry.js";

export interface StripeContext {
  customerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  mrr?: number;
  totalRevenue?: number;
  invoices: Array<{
    id: string;
    amount: number;
    status: string;
    date: string;
  }>;
}

async function fetchStripeCustomerByEmail(
  token: string,
  email: string
): Promise<StripeContext> {
  const searchRes = await fetch(
    `https://api.stripe.com/v1/customers/search?query=email:"${email}"&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!searchRes.ok) return { invoices: [] };
  const { data } = (await searchRes.json()) as { data: Array<{ id: string }> };
  if (!data.length) return { invoices: [] };

  const customerId = data[0]!.id;

  // Fetch subscription
  const subRes = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${customerId}&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const subData = (await subRes.json()) as {
    data: Array<{ id: string; status: string; plan?: { amount?: number } }>;
  };
  const sub = subData.data[0];

  // Fetch invoices
  const invRes = await fetch(
    `https://api.stripe.com/v1/invoices?customer=${customerId}&limit=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const invData = (await invRes.json()) as {
    data: Array<{ id: string; amount_paid: number; status: string; created: number }>;
  };

  const invoices = invData.data.map((inv) => ({
    id: inv.id,
    amount: inv.amount_paid / 100,
    status: inv.status,
    date: new Date(inv.created * 1000).toISOString().slice(0, 10),
  }));

  return {
    customerId,
    subscriptionId: sub?.id,
    subscriptionStatus: sub?.status,
    mrr: sub?.plan?.amount ? sub.plan.amount / 100 : undefined,
    totalRevenue: invoices.reduce((sum, inv) => sum + inv.amount, 0),
    invoices,
  };
}

export function createStripePlugin(stripeToken: string): DxcrmPlugin {
  return {
    name: "stripe",
    version: "1.0.0",
    description: "Stripe subscription and revenue context for CRM customers",
    mcpTools: ["get_stripe_context"],
  };
}

// MCP Tool: get_stripe_context
export async function handleGetStripeContext(
  input: { slug: string; email?: string },
  dataDir: string,
  stripeToken: string
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // Read email from main_facts if not provided
  let email = input.email;
  if (!email) {
    const { readMainFacts } = await import("../fs/customer-dir.js");
    const facts = await readMainFacts(dataDir, input.slug).catch(() => ({} as Record<string, unknown>));
    email = facts["email"] as string | undefined;
  }
  if (!email) {
    return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "No email found for customer" }) }] };
  }
  const context = await fetchStripeCustomerByEmail(stripeToken, email);
  return { content: [{ type: "text", text: JSON.stringify({ success: true, ...context }, null, 2) }] };
}
```

**Tests:** `__tests__/plugins/stripe.test.ts`
- fetchStripeCustomerByEmail: found, not found, API error
- handleGetStripeContext: reads email from main_facts, returns correct structure

---

### R4.3 Linear Plugin

**Datei:** `src/plugins/linear.ts`

Verknüpft CRM-Kunden mit Linear-Projekten und offenen Issues.

```typescript
// src/plugins/linear.ts — GraphQL API
const LINEAR_API = "https://api.linear.app/graphql";

export interface LinearIssue {
  id: string;
  title: string;
  state: { name: string };
  priority: number;
  assignee?: { name: string };
  createdAt: string;
}

export async function fetchLinearIssuesByCustomer(
  token: string,
  customerName: string
): Promise<LinearIssue[]> {
  const query = `
    query IssuesByCustomer($filter: String!) {
      issues(filter: { title: { containsIgnoreCase: $filter } }, first: 50) {
        nodes { id title state { name } priority assignee { name } createdAt }
      }
    }
  `;
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { filter: customerName } }),
  });
  if (!res.ok) return [];
  const { data } = (await res.json()) as { data?: { issues?: { nodes: LinearIssue[] } } };
  return data?.issues?.nodes ?? [];
}

export async function handleGetLinearIssues(
  input: { slug: string; customerName?: string },
  dataDir: string,
  linearToken: string
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  let name = input.customerName ?? input.slug;
  try {
    const { readMainFacts } = await import("../fs/customer-dir.js");
    const facts = await readMainFacts(dataDir, input.slug);
    name = (facts["name"] as string | undefined) ?? name;
  } catch { /* use slug */ }

  const issues = await fetchLinearIssuesByCustomer(linearToken, name);
  return { content: [{ type: "text", text: JSON.stringify({ success: true, slug: input.slug, issues }, null, 2) }] };
}
```

**Tests:** `__tests__/plugins/linear.test.ts`
- fetchLinearIssuesByCustomer: found, empty, API error
- handleGetLinearIssues: reads name from main_facts

---

## Sprint R5 — Cross-Customer Intelligence (3 Wochen)

### R5.1 Cross-Customer Query Engine

**Datei:** `src/core/cross-customer.ts`

Ermöglicht Queries quer über alle Kunden: "Welche Kunden haben ähnliche Probleme wie Acme Corp?"

#### Design

```typescript
// src/core/cross-customer.ts
import { searchKnowledge } from "./lancedb.js";
import fs from "fs";
import path from "path";

export interface CrossCustomerResult {
  slug: string;
  customerName: string;
  relevantContent: string;
  score: number;
}

export async function searchAcrossCustomers(
  dataDir: string,
  query: string,
  limit = 5,
  excludeSlug?: string
): Promise<CrossCustomerResult[]> {
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) return [];

  const slugs = fs.readdirSync(customersDir).filter(
    (d) => d !== excludeSlug && fs.statSync(path.join(customersDir, d)).isDirectory()
  );

  const allResults: CrossCustomerResult[] = [];

  for (const slug of slugs) {
    const results = await searchKnowledge(dataDir, slug, query, 2);
    for (const r of results) {
      // k-anonymization: don't expose customer name in search results above threshold
      allResults.push({
        slug,
        customerName: slug, // use slug (not real name) for privacy
        relevantContent: r.content.slice(0, 200),
        score: r.score,
      });
    }
  }

  return allResults.sort((a, b) => b.score - a.score).slice(0, limit);
}
```

**MCP-Tool:** `get_market_intelligence({ query, excludeSlug? })`

```typescript
// src/mcp/tools/get-market-intelligence.ts
// Returns: { query, results: CrossCustomerResult[], totalCustomersSearched: number }
// Privacy: uses slug instead of real name, minScore threshold
```

**Tests:** `__tests__/core/cross-customer.test.ts`
- searchAcrossCustomers: empty dataDir, multiple customers
- excludeSlug: current customer excluded
- Results sorted by score

---

## Sprint R6 — Google Drive + SSO (Optional, 3 Wochen)

### R6.1 Google Drive Attachment Sync

**Datei:** `src/sync/google-drive-sync.ts`

Synct Proposals, Contracts, Decks aus Google Drive.

```typescript
GET https://www.googleapis.com/drive/v3/files
  ?q=name+contains+"{customer_name}"+and+mimeType+!=+"application/vnd.google-apps.folder"
  &fields=files(id,name,mimeType,webViewLink,modifiedTime,size)
  &pageSize=100

// Export Google Docs as plain text
GET https://www.googleapis.com/drive/v3/files/{id}/export?mimeType=text/plain
```

**Storage:** `customers/<slug>/attachments/` + index in LanceDB

---

### R6.2 SSO / SAML 2.0 (WorkOS Integration)

**Strategie:** WorkOS als Abstraktionsschicht (unterstützt SAML, OIDC, Google Workspace SSO, Okta, Azure AD in einem SDK).

```typescript
// src/core/sso.ts
// WorkOS SDK: npm i @workos-inc/node
import { WorkOS } from "@workos-inc/node";

const workos = new WorkOS(process.env.WORKOS_API_KEY!);

export async function getSsoAuthorizationUrl(
  organizationId: string,
  redirectUri: string
): Promise<string> {
  return workos.sso.getAuthorizationUrl({ organizationId, redirectUri });
}

export async function authenticateWithCode(code: string): Promise<{ email: string; role?: string }> {
  const { profile } = await workos.sso.getProfileAndToken({ code });
  return { email: profile.email, role: profile.rawAttributes?.["dxcrm_role"] as string | undefined };
}
```

**Warum optional:** Self-hosted solo users brauchen kein SSO. Nur für Enterprise-Teams relevant.

---

## Technische Schulden + Cleanup

| Item | Aufwand | Priorität |
|---|---|---|
| HubSpot Async Export API (Bulk) | 1 Tag | Mittel |
| Gmail historyId in sync-state.json persistieren | 0.5 Tage | Hoch |
| Microsoft on-query delta-sync (deltaLink statt full resync) | 1 Tag | Mittel |
| Salesforce ActivityHistory + EmailMessage | 1 Tag | Mittel |
| `dxcrm stages` CLI fertig verdrahten in cli.ts | 0.5 Tage | Hoch |
| `dxcrm plugin list/info` in cli.ts verdrahten | 0.5 Tage | Hoch |
| Plugin Hooks in MCP-Tool-Handler verdrahten | 1 Tag | Mittel |
| Alle neuen Commands in docs/cli-reference.md | 0.5 Tage | Hoch |

---

## Sprint-Reihenfolge (Empfehlung)

```
R1 (2 Wo): HubSpot v4 Connector + Gmail Full-Body/Push Watch
R2 (2 Wo): Webhook Receiver + Custom Pipeline Stages
R3 (1 Wo): Email Threading + Deduplication
R4 (2 Wo): Slack + Stripe + Linear Plugins
R5 (2 Wo): Cross-Customer Intelligence MCP Tool
R6 (3 Wo): Google Drive + SSO (falls Enterprise-Bedarf)
─────────────────────────────────────────────────────
Gesamt:    12–15 Wochen (Solo-Dev, TDD)
```

## Neue Dateien (Übersicht)

```
src/sync/connectors/
  hubspot.ts               ← R1.1

src/sync/
  gmail-push-watch.ts      ← R1.2
  gmail-webhook-handler.ts ← R1.2
  email-dedup.ts           ← R3.1
  google-drive-sync.ts     ← R6.1

src/core/
  webhook-receiver.ts      ← R2.1
  pipeline-stages.ts       ← R2.2
  cross-customer.ts        ← R5.1
  sso.ts                   ← R6.2 (optional)

src/mcp/tools/
  get-pipeline-stages.ts   ← R2.2
  get-market-intelligence.ts ← R5.1
  get-stripe-context.ts    ← R4.2
  get-linear-issues.ts     ← R4.3

src/plugins/
  slack.ts                 ← R4.1
  stripe.ts                ← R4.2
  linear.ts                ← R4.3

src/commands/
  pipeline-stages.ts       ← R2.2

__tests__/
  sync/connectors/hubspot.test.ts
  sync/gmail-push-watch.test.ts
  sync/email-dedup.test.ts
  core/webhook-receiver.test.ts
  core/pipeline-stages.test.ts
  core/cross-customer.test.ts
  mcp/tools/get-pipeline-stages.test.ts
  mcp/tools/get-market-intelligence.test.ts
  plugins/slack.test.ts
  plugins/stripe.test.ts
  plugins/linear.test.ts
```

## Ersetzungsvertrauen nach R1–R6

| CRM | Jetzt (nach E1–E6) | +R1–R3 | +R4–R6 |
|---|---|---|---|
| HubSpot Free | 96% | **99%** | 99% |
| HubSpot Professional | 88% | **95%** | 98% |
| Salesforce Enterprise | 55% | **72%** | 85% |
| Dynamics 365 | 60% | **75%** | 88% |
| Pipedrive | 97% | **99%** | 99% |
| Notion/Spreadsheet | 99% | 99% | 99% |
