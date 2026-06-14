# Phase 1 — Onboarding & First-Value Implementation Plan (#106 + #75)

> Plan date: 2026-06-14 · Branch base: `main` @ `12d1c78` · npm `datasynx-opencrm` 1.41.0+
> Research: [`docs/research/2026-06-14-phase-1-onboarding-first-value.md`](../research/2026-06-14-phase-1-onboarding-first-value.md)
> Covers the two remaining ROADMAP Phase 1 (P0) issues; #103 already delivered.

## Overview

Deliver the two open **Phase 1 (P0 — directly serves the kill condition)** issues:

- **[#106](https://github.com/datasynx/datasynx-crm/issues/106)** — auto-resolve `firstName` / `senderName` / `ownerName` in
  `draft_email` so the #103 starter templates render cleanly with **zero overrides**.
- **[#75](https://github.com/datasynx/datasynx-crm/issues/75)** — carry the proven #66 *unmatched-queue* pattern
  (event + daily digest + per-entry resolve) from transcripts to **conversations**
  (web-chat / WhatsApp threads that don't route to a customer).

Both are sandbox-capable (no live credentials, no Hugging Face download). They are
**independent** and ship as **two separate feature branches / PRs** so semantic-release
produces two clean `feat` commits. Order: **#106 first** (single function, fastest
first-value win), then **#75**.

## Decisions Made (no open questions)

All judgment calls are resolved here, per the autonomy mandate in `CLAUDE.md`:

1. **#75 adds NO MCP tool.** It mirrors #66 exactly: a JSON queue store + events + a daily
   digest + a CLI command. `TOOL_COUNT` stays **82**. This avoids the `ALL_TOOLS` / RBAC /
   `capabilities.ts` bookkeeping and keeps the change tightly scoped, exactly like #66.
2. **#75 CLI = a new top-level `conversations` command**, mirroring the existing top-level
   `transcripts` command (`unmatched` / `resolve` / `clear`). This matches the issue's
   explicit wording (`dxcrm conversations resolve <ref>`). The existing `inbox` command stays
   the *interactive* surface (`list`/`show`/`reply`/`assign`); `conversations` is the
   *queue-ops* surface — exactly the split `transcripts` already has from the rest of the app.
   CLI top-level count goes **69 → 70**.
3. **#75 resolve signature: `conversations resolve <ref> <slug>`.** `<ref>` is the
   conversation id (`conv_…`). It links the conversation to the customer **and** drains the
   queue entry (the conversation case does more than the transcript case, which only dequeues).
4. **#75 enqueue trigger & dedup.** Enqueue + emit `conversation.unmatched` **once**, when a
   *new* thread is created with `slug === null`. The store append is **idempotent by `id`**,
   and the event fires **only on first insert**, so repeated messages from the same unmatched
   visitor never spam the queue or the event bus. When a later message on a previously-unmatched
   thread resolves the slug (existing retry at `conversations.ts:135`), the entry is
   **auto-removed** from the queue.
5. **#75 reason enum:** `"no_customer_match"` (a routable identifier was present but matched no
   customer) | `"no_contact_identifier"` (no email to route on, e.g. a WhatsApp `wa_id`).
6. **#106 `senderName`/`ownerName`** both resolve from `DXCRM_ACTOR` via a new
   `getActorName()` helper that returns `""` (not the literal `"system"`) when unset — so the
   signature renders blank rather than `{{senderName}}` or `system`. No new env var.
7. **#106 `firstName`** = first whitespace token of the **primary contact name**, sourced from
   `getPrimaryContact(...).name` (structured `contacts.json`) and falling back to
   `main_facts.primary_contact` (free string), then `""`.
8. **#106 leaves the `de-DE` date/month locale untouched** — that is explicitly deferred to
   i18n issue #83 (per the #106 note).

## Current State Analysis

### #106 — template variables
- `buildVariablesFromCustomer` (`src/core/template-engine.ts:18-34`) resolves only 8 vars
  (`company`, `domain`, `email`, `stage`, `slug`, `date`, `year`, `month`). `firstName`,
  `senderName`, `ownerName` are **not** produced.
- `draft_email` already merges `overrides` last (`src/mcp/tools/draft-email.ts:30-31`), so any
  added variable stays overridable.
- `interpolate` keeps unknown `{{key}}` **literal** (`template-engine.ts:7-12`); an **empty
  string** value is substituted as `""` (so `""` is the desired "absent" value).
- Sources already exist but are unused by this path: `getActor()`
  (`src/fs/audit-log.ts:17-20`), `getPrimaryContact()` (`src/fs/contacts-writer.ts:54-57`),
  `MainFacts.primary_contact` (`src/schemas/main-facts.ts:12`).
- The #103 starters all use `{{firstName}}` + `{{senderName}}` (`src/core/starter-content.ts`),
  as does the `template create` default body (`src/commands/template.ts:73-74`).
- `docs/schemas.md:261-271` documents a fictional table (`customerName`, `contactEmail`,
  `dealValue`, `ownerName`) that does not match the engine; `senderName`/`firstName` are absent.

### #75 — unmatched conversations
- Conversations persist with `slug: string | null` (`src/core/conversations.ts:33-46`); routing
  is **email-only** (`resolveConversationSlug` → `routeMessage`, returns `null` on no match).
- On a no-match today: `slug` is `null`, the CRM-timeline mirror is skipped
  (`conversations.ts:156`), events emit with `slug: ""`, and **nothing queues or alerts**.
- The #66 transcript pattern is the complete, tested template to mirror:
  `src/fs/unmatched-transcripts.ts`, `src/core/unmatched-digest.ts`,
  `src/commands/transcripts.ts`, daemon hook `src/daemon/worker.ts:386-392`,
  `dxcrm status --unmatched` surface `src/commands/status.ts:64-78,127-135`.

## Desired End State

- `draft_email` against `starter-cold-intro` on a vault with `DXCRM_ACTOR` set and a primary
  contact renders `{{firstName}}` and `{{senderName}}` with no overrides; `docs/schemas.md`
  matches the engine output.
- An unbound inbound web-chat/WhatsApp message creates an entry in
  `.agentic/unmatched-conversations.json`, emits `conversation.unmatched`, shows up in
  `dxcrm conversations unmatched` and `dxcrm status`, is summarized daily via
  `queue.unmatched_conversations_digest`, and can be linked + drained with
  `dxcrm conversations resolve <conv_id> <slug>`.
- `npm test` / `typecheck` / `lint` / `build` / `docs:check` all green; `TOOL_COUNT` = 82;
  CLI count strings updated 69 → 70.

## What We're NOT Doing

- **No new MCP tool** for #75 (CLI + events + digest only, mirroring #66).
- **No phone/`wa_id`-based customer routing** — WhatsApp stays email-unmatched at ingest; #75
  only surfaces and resolves the unmatched state, it does not add a new matching strategy.
- **No i18n / locale changes** in #106 (`de-DE` date/month deferred to #83).
- **No timeline backfill of every historical message** on resolve — resolve logs a single
  linkage interaction; subsequent inbound messages mirror normally (avoids `sourceRef`
  duplication concerns).
- **No change to `inbox`'s existing subcommands** beyond leaving them as-is.
- **No M2/M4 work** and no changes to strategic direction / kill conditions.

## Implementation Approach

TDD throughout (test-first, per `CLAUDE.md`). Each phase is independently green. #106 is one
phase on its own branch; #75 is four phases on a second branch, built bottom-up
(store → ingestion → digest/daemon → CLI/status) so each layer is tested before the next.

---

## Phase 1 — #106: Auto-resolve `firstName` / `senderName` / `ownerName`

**Branch:** `feat/106-template-variables`

### Overview
Extend the single resolver function and add one tiny actor-name helper; reconcile the docs.

### Changes Required

#### 1. Actor display-name helper
**File**: `src/fs/audit-log.ts`
**Changes**: Add next to `getActor()`:
```ts
/**
 * Display name for templates (#106): the actor, or "" when unset/"system" so a
 * signature renders blank rather than the literal {{senderName}} or "system".
 */
export function getActorName(): string {
  const actor = getActor();
  return actor === "system" ? "" : actor;
}
```

#### 2. Resolve the three variables in the engine
**File**: `src/core/template-engine.ts`
**Changes**: Import the helpers and extend `buildVariablesFromCustomer`:
```ts
import { readMainFacts } from "../fs/customer-dir.js";
import { getActorName } from "../fs/audit-log.js";
import { getPrimaryContact } from "../fs/contacts-writer.js";

function firstNameOf(fullName: string | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

export async function buildVariablesFromCustomer(
  dataDir: string,
  slug: string
): Promise<TemplateVariables> {
  const facts = await readMainFacts(dataDir, slug).catch(() => null);
  const now = new Date();
  const senderName = getActorName();
  const contactName = getPrimaryContact(dataDir, slug)?.name ?? facts?.primary_contact;
  return {
    company: facts?.name ?? slug,
    domain: facts?.domain ?? "",
    email: facts?.email ?? "",
    stage: facts?.relationship_stage ?? "",
    slug,
    firstName: firstNameOf(contactName),
    senderName,
    ownerName: senderName,
    date: now.toLocaleDateString("de-DE"),
    year: now.getFullYear(),
    month: now.toLocaleDateString("de-DE", { month: "long" }),
  };
}
```
*No circular import:* `audit-log.ts` imports only `fs`/`path`; `contacts-writer.ts` imports
`json-store` + `customer-dir` (already a dependency of this module).

#### 3. Docs reconciliation
**File**: `docs/schemas.md` (lines 261-271)
**Changes**: Replace the table with the engine's actual output:
```markdown
**Standard template variables** (auto-resolved by `draft_email`; any can be overridden):

| Variable | Source |
|---|---|
| `{{company}}` | Customer name (`main_facts.name`, falls back to the slug) |
| `{{domain}}` | Customer domain |
| `{{email}}` | Customer primary email |
| `{{stage}}` | Relationship stage |
| `{{slug}}` | Customer slug |
| `{{firstName}}` | Primary contact's first name (`contacts.json`, else `primary_contact`) |
| `{{senderName}}` / `{{ownerName}}` | Operator name (from `DXCRM_ACTOR`; blank if unset) |
| `{{date}}` / `{{month}}` / `{{year}}` | Current date parts |
```

#### 4. Tests (write first)
**File**: `__tests__/core/template-engine.test.ts`
- New: with `process.env.DXCRM_ACTOR = "Alice Operator"` and a primary contact
  `{ name: "Jane Roe", email, isPrimary: true }` in `contacts.json`,
  `buildVariablesFromCustomer` returns `firstName: "Jane"`, `senderName: "Alice Operator"`,
  `ownerName: "Alice Operator"`.
- New: with no `DXCRM_ACTOR` and no contact → `senderName === ""`, `firstName === ""`.
- New: `firstName` falls back to `main_facts.primary_contact` ("Bob Smith" → "Bob") when no
  `contacts.json`. (Quote the `created`/`updated` fixture dates — YAML date gotcha.)
- Save/restore `process.env.DXCRM_ACTOR` in `beforeEach`/`afterEach`.

**File**: `__tests__/mcp/tools/draft-email.test.ts`
- Update the existing "unresolved variables stay as `{{var}}`" test (lines 81-90) to assert
  against a genuinely-unknown variable (e.g. `{{unknownVar}}`) — `{{firstName}}` now resolves.
- New: `draft_email` on a starter-style body with `DXCRM_ACTOR` + a primary contact renders the
  greeting and sign-off with no `overrides` (no remaining `{{firstName}}`/`{{senderName}}`).

### Success Criteria

#### Automated Verification:
- [x] `npm test` green (new + updated engine/draft-email tests) — 3825 passed
- [x] `npm run typecheck` clean
- [x] `npm run lint` clean
- [x] `npm run build` clean
- [x] `npm run docs:check` green (schemas.md links/anchors intact)

#### Manual Verification:
- [x] `DXCRM_ACTOR="Jane Doe" … template preview cold --slug acme` → body "Hi Jane," and
      "Best, Jane Doe", no `{{…}}` placeholders (verified on the built binary).
- [x] With `DXCRM_ACTOR` unset, the same preview renders the signature blank (no literal
      `{{senderName}}`).

---

## Phase 2 — #75: Unmatched-conversations queue store

**Branch:** `feat/75-unmatched-conversations`

### Overview
Mirror `src/fs/unmatched-transcripts.ts` for conversations, with an idempotent append.

### Changes Required

#### 1. New store
**File**: `src/fs/unmatched-conversations.ts` (new)
```ts
import path from "path";
import { readJsonFile, writeJsonFile } from "./json-store.js";

export interface UnmatchedConversation {
  id: string; // conversation id (conv_…), the resolve ref
  channel: string; // "web" | "whatsapp" | …
  threadKey: string;
  contact: { name?: string; email?: string; phone?: string };
  addedAt: string; // ISO timestamp
  reason: "no_customer_match" | "no_contact_identifier";
}

function queuePath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "unmatched-conversations.json");
}

export function readUnmatchedConversations(dataDir: string): UnmatchedConversation[] {
  return readJsonFile<UnmatchedConversation[]>(queuePath(dataDir), []);
}

/** Idempotent by id; returns false when the id was already queued. */
export function appendUnmatchedConversation(
  dataDir: string,
  entry: UnmatchedConversation
): boolean {
  const queue = readUnmatchedConversations(dataDir);
  if (queue.some((c) => c.id === entry.id)) return false;
  writeJsonFile(queuePath(dataDir), [...queue, entry]);
  return true;
}

/** Remove one entry by conversation id; false when nothing matched. */
export function removeUnmatchedConversation(dataDir: string, id: string): boolean {
  const queue = readUnmatchedConversations(dataDir);
  const next = queue.filter((c) => c.id !== id);
  if (next.length === queue.length) return false;
  writeJsonFile(queuePath(dataDir), next);
  return true;
}

export function clearUnmatchedConversations(dataDir: string): void {
  writeJsonFile(queuePath(dataDir), []);
}
```

#### 2. Tests (write first)
**File**: `__tests__/fs/unmatched-conversations.test.ts` (new, memfs)
- `read` → `[]` when absent; parses existing array; `[]` on invalid JSON.
- `append` creates `.agentic/unmatched-conversations.json` and preserves order.
- `append` is **idempotent**: second append of the same `id` returns `false`, queue length
  unchanged.
- `remove` drops one by id, returns `false` for unknown id.
- `clear` resets to `[]`.

### Success Criteria
#### Automated Verification:
- [x] `npm test` green (new store test)
- [x] `npm run typecheck` / `lint` / `build` clean

---

## Phase 3 — #75: Emit `conversation.unmatched` from ingestion

### Overview
Queue + emit on first unmatched creation; auto-drain when a thread later resolves.

### Changes Required

#### 1. Wire into `ingestInbound`
**File**: `src/core/conversations.ts`
**Changes**: Capture the prior slug before the re-resolve, then after `writeConversation`
(around `conversations.ts:153`) add the queue/event logic:
```ts
// before the `if (!conv.slug) conv.slug = …` line in the `existing` branch:
const prevSlug = existing ? existing.slug : null;
// … existing ingest body (re-resolve, push message, writeConversation) …

if (!conv.slug) {
  const { appendUnmatchedConversation } = await import("../fs/unmatched-conversations.js");
  const reason = conv.contact.email ? "no_customer_match" : "no_contact_identifier";
  const added = appendUnmatchedConversation(dataDir, {
    id: conv.id,
    channel: conv.channel,
    threadKey: conv.threadKey,
    contact: conv.contact,
    addedAt: now,
    reason,
  });
  if (added) {
    await emitEvent(dataDir, "conversation.unmatched", {
      conversationId: conv.id,
      channel: conv.channel,
      contact: contactLabel(conv.contact),
      reason,
    }).catch(() => undefined);
  }
} else if (prevSlug === null) {
  // a previously-unmatched thread just got linked → drain the queue
  const { removeUnmatchedConversation } = await import("../fs/unmatched-conversations.js");
  removeUnmatchedConversation(dataDir, conv.id);
}
```
(Best-effort `.catch(() => undefined)`, dynamic imports — same convention as the transcript
producers and the existing conversation events.)

#### 2. Tests (write first)
**File**: `__tests__/core/conversations.test.ts` (extend; mock `emitEvent`)
- New unmatched web thread (email present, no customer) → queue length 1 with
  `reason: "no_customer_match"`, and one `conversation.unmatched` emit.
- New WhatsApp thread (phone only) → queued with `reason: "no_contact_identifier"`.
- A second message on the same unmatched thread → **no duplicate** queue entry and **no second**
  `conversation.unmatched` emit (idempotency).
- A later message that supplies a matching email → slug resolves, queue entry **removed**.

### Success Criteria
#### Automated Verification:
- [x] `npm test` green (extended conversations test)
- [x] `npm run typecheck` / `lint` / `build` clean

#### Manual Verification:
- [x] `POST /chat` with an unknown email creates a queue entry and fires the event (observable
      via a registered webhook or the log line).

---

## Phase 4 — #75: Daily digest + daemon wiring

### Overview
Mirror `unmatched-digest.ts`; hook into the existing 06:00 cron.

### Changes Required

#### 1. New digest
**File**: `src/core/unmatched-conversations-digest.ts` (new)
```ts
import { readUnmatchedConversations } from "../fs/unmatched-conversations.js";
import { emitEvent } from "./webhooks.js";
import { logger } from "./logger.js";

export interface UnmatchedConversationsDigest {
  count: number;
  oldest: string;
}

export async function emitUnmatchedConversationsDigest(
  dataDir: string
): Promise<UnmatchedConversationsDigest | null> {
  const queue = readUnmatchedConversations(dataDir);
  if (queue.length === 0) return null;

  const oldest = queue.reduce((min, c) => (c.addedAt < min ? c.addedAt : min), queue[0]!.addedAt);
  const digest = { count: queue.length, oldest };

  await emitEvent(dataDir, "queue.unmatched_conversations_digest", {
    ...digest,
    refs: queue.slice(0, 20).map((c) => c.id),
  }).catch(() => undefined);

  logger.warn("conversations", "unmatched conversations need attention", {
    count: digest.count,
    oldest,
    hint: "dxcrm conversations unmatched / resolve <ref> <slug>",
  });
  return digest;
}
```

#### 2. Daemon hook
**File**: `src/daemon/worker.ts`
**Changes**: In the 06:00 `CronJob` callback, after the existing transcript-digest `try` block
(`worker.ts:386-392`), add a sibling block:
```ts
// Unmatched-conversations digest (#75): same daily operator nudge for inbound chat.
try {
  const { emitUnmatchedConversationsDigest } = await import(
    "../core/unmatched-conversations-digest.js"
  );
  await emitUnmatchedConversationsDigest(DATA_DIR);
} catch (err) {
  logger.error("conversations", "unmatched conversations digest failed", {
    error: (err as Error).message,
  });
}
```

#### 3. Tests (write first)
**File**: `__tests__/core/unmatched-conversations-digest.test.ts` (new; mock `emitEvent`)
- Empty queue → returns `null`, no emit, no warn.
- Two entries → returns `{ count: 2, oldest }`, emits `queue.unmatched_conversations_digest`
  with `{ count, oldest, refs: [ids] }`.

### Success Criteria
#### Automated Verification:
- [x] `npm test` green (new digest test)
- [x] `npm run typecheck` / `lint` / `build` clean

#### Manual Verification:
- [x] With a non-empty queue, a daemon cycle (or a direct call) emits the digest event and logs
      the warn line.

---

## Phase 5 — #75: `conversations` CLI command + status surface + docs

### Overview
New top-level `conversations` command (`unmatched`/`resolve`/`clear`), a `status` surface, and
all doc/count updates.

### Changes Required

#### 1. Link helper on the conversation model
**File**: `src/core/conversations.ts`
**Changes**: Add an exported linker used by `resolve`:
```ts
/** Link an existing conversation to a customer slug and log the linkage (#75). */
export async function linkConversationToCustomer(
  dataDir: string,
  id: string,
  slug: string
): Promise<Conversation | null> {
  const conv = getConversation(dataDir, id);
  if (!conv) return null;
  conv.slug = slug;
  writeConversation(dataDir, conv);

  const { appendInteraction } = await import("../fs/interactions-writer.js");
  const first = conv.messages.find((m) => m.from === "customer");
  await appendInteraction(dataDir, slug, {
    date: new Date().toISOString().slice(0, 10),
    type: "Note",
    direction: "inbound",
    with: contactLabel(conv.contact),
    subject: `${channelLabel(conv.channel)} conversation linked`,
    summary: (first?.text ?? "").slice(0, 1000),
    nextSteps: [],
    sourceRef: `conversation:${conv.id}:linked`,
    synced: new Date().toISOString(),
  }).catch(() => undefined);

  await emitEvent(dataDir, "conversation.assigned", {
    conversationId: conv.id,
    slug,
    assignee: conv.assignee ?? "",
    status: conv.status,
  }).catch(() => undefined);
  return conv;
}
```

#### 2. New CLI command
**File**: `src/commands/conversations.ts` (new) — mirrors `src/commands/transcripts.ts`:
```ts
import { Command } from "commander";
import { info, bold, error } from "../ui/colors.js";
import {
  readUnmatchedConversations,
  clearUnmatchedConversations,
  removeUnmatchedConversation,
} from "../fs/unmatched-conversations.js";

const dataDir = (): string => process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function runConversationsResolve(ref: string, slug: string): Promise<void> {
  const { getConversation, linkConversationToCustomer } = await import("../core/conversations.js");
  const { listCustomerSlugs } = await import("../fs/customer-dir.js");
  if (!getConversation(dataDir(), ref)) {
    console.error(error(`No conversation '${ref}' — see: dxcrm conversations unmatched`));
    process.exitCode = 1;
    return;
  }
  if (!listCustomerSlugs(dataDir()).includes(slug)) {
    console.error(error(`Unknown customer slug '${slug}'.`));
    process.exitCode = 1;
    return;
  }
  await linkConversationToCustomer(dataDir(), ref, slug);
  removeUnmatchedConversation(dataDir(), ref);
  console.log(info(`Resolved ${ref} → linked to ${slug}, removed from the unmatched queue.`));
}

export const conversationsCommand = new Command("conversations").description(
  "Inbound conversation routing: the unmatched queue (web-chat/WhatsApp that didn't route)"
);

conversationsCommand
  .command("unmatched")
  .description("List inbound conversations that could not be routed to a customer")
  .action(() => {
    const queue = readUnmatchedConversations(dataDir());
    if (queue.length === 0) {
      console.log(info("No unmatched conversations. Every thread landed on a customer. 🎉"));
      return;
    }
    console.log(bold(`${queue.length} unmatched conversation(s):`));
    for (const c of queue) {
      const who = c.contact.email || c.contact.phone || c.contact.name || "anon";
      console.log(`  ${c.id}  ${c.channel}  ${who}  (${c.reason}, ${c.addedAt})`);
    }
    console.log(info("Link one with: dxcrm conversations resolve <id> <slug>"));
  });

conversationsCommand
  .command("resolve <ref> <slug>")
  .description("Link an unmatched conversation to a customer slug and drain the queue entry")
  .action(runConversationsResolve);

conversationsCommand
  .command("clear")
  .description("Clear the unmatched-conversations queue")
  .action(() => {
    clearUnmatchedConversations(dataDir());
    console.log(info("Unmatched-conversations queue cleared."));
  });
```

#### 3. Register the command (count 69 → 70)
**File**: `src/commands/registry.ts`
- Add `import { conversationsCommand } from "./conversations.js";` (near line 48).
- Add `conversationsCommand` to `ALL_COMMANDS` (place right after `inboxCommand`, line 123).

#### 4. Status surface (mirror transcripts)
**File**: `src/commands/status.ts`
- In the `--unmatched` block (after the transcripts section, ~`:78`), print an "Unmatched
  Conversations" section reading `readUnmatchedConversations(dir)`.
- In the main summary, add an `Unmatched conv:` line mirroring the transcript count line
  (`:127-135`).

#### 5. Docs + counts
- **`docs/cli-reference.md`** — regenerate via `npm run docs:generate` (AUTOGEN block; index
  becomes `(70)`).
- **`docs/integrations.md`** — add `conversation.unmatched` and
  `queue.unmatched_conversations_digest` to the events list / unmatched section (mirror the
  transcript entries).
- **Manual count strings 69 → 70:** `README.md:223`, `README.md:416`, `ROADMAP.md:22`.
  (`TOOL_COUNT`/82 strings are unchanged.)
- **`ROADMAP.md`** — mark #75 and #106 delivered in the Phase 1 table; update the "Where We
  Stand" line; queue any follow-up found during the run.

#### 6. Tests (write first)
**File**: `__tests__/commands/conversations.test.ts` (new; spy `process.cwd → "/data"`, memfs)
- `runConversationsResolve` with an unknown ref → `process.exitCode = 1`, error message.
- Unknown slug → `process.exitCode = 1`.
- Happy path: seeds a queued unmatched conversation + a customer; resolve sets `conv.slug`,
  removes the queue entry, prints "Resolved", and `process.exitCode` is unset.
- `unmatched` listing: empty vs non-empty output.
- `clear` empties the queue.

**File**: `__tests__/commands/status.test.ts` (extend) — `--unmatched` shows the conversations
section; the summary count line renders.

### Success Criteria

#### Automated Verification:
- [x] `npm test` green (command + status tests)
- [x] `npm run typecheck` / `lint` / `build` clean
- [x] `npm run docs:generate` produces no uncommitted drift after commit (CLI index shows 70)
- [x] `npm run docs:check` green (new integrations.md links/anchors intact)
- [x] `dxcrm conversations --help` lists `unmatched`, `resolve`, `clear`

#### Manual Verification:
- [x] End-to-end on the built binary: `POST /chat` with an unknown email → appears in
      `dxcrm conversations unmatched` and `dxcrm status`; `dxcrm conversations resolve <id> <slug>`
      links it (visible in `dxcrm inbox show <id>`) and removes it from the queue.
- [x] A WhatsApp inbound (no email) queues with `no_contact_identifier`.

---

## Testing Strategy

### Unit Tests
- `firstNameOf` splitting, `getActorName()` fallback, full `buildVariablesFromCustomer` output.
- Store CRUD + idempotent append + remove-unknown.
- Digest empty/non-empty + event payload shape.
- CLI resolve guards (bad ref / bad slug) and happy path; exit-code semantics
  (`process.exitCode = 1`, never `process.exit()` — SOP §4).

### Integration Tests
- `ingestInbound` end-to-end: unmatched enqueue + event, idempotency, auto-drain on resolve.
- `conversation-routes` already cover `POST /chat` + WhatsApp ingest; no route changes needed.

### Manual Testing Steps
1. `DXCRM_DATA_DIR=/tmp/dx npm run build && node dist/cli.js init` in a throwaway dir.
2. `draft_email` against a starter with `DXCRM_ACTOR` set → no placeholders (#106).
3. `curl POST /chat` with an unknown email → `dxcrm conversations unmatched` shows it (#75).
4. `dxcrm conversations resolve <id> <slug>` → linked + drained; `dxcrm status` count drops.

## Performance Considerations
Negligible. Queue files are small JSON arrays read/written via the existing atomic
`json-store` helpers; the digest runs once daily in the daemon. The idempotent append does one
extra `readUnmatchedConversations` per inbound message on an *unmatched* thread only.

## Migration Notes
No migrations. New files (`.agentic/unmatched-conversations.json`) are created lazily and absent
on existing vaults (read falls back to `[]`). #106 only adds keys to an in-memory variable map;
existing templates that pass `overrides` are unaffected (overrides still win).

## Rollout / Commit Discipline (per SOP §4)
- Two branches, two PRs: `feat/106-template-variables`, then `feat/75-unmatched-conversations`.
- Before each merge: `git pull origin main`; on divergence `git rebase main` keeping the remote
  `version`; `--force-with-lease`. Commit gate: `npm test` · `typecheck` · `lint` · `build` ·
  `docs:check` green · `TOOL_COUNT` = 82 maintained.
- Each issue documents the 5 steps (research/plan/test-first/e2e/docs+merge) as issue comments;
  close with a delivery mapping; update `ROADMAP.md` Phase 1 table.

## References
- Research: [`docs/research/2026-06-14-phase-1-onboarding-first-value.md`](../research/2026-06-14-phase-1-onboarding-first-value.md)
- Issues: [#106](https://github.com/datasynx/datasynx-crm/issues/106), [#75](https://github.com/datasynx/datasynx-crm/issues/75); reference pattern [#66](https://github.com/datasynx/datasynx-crm/issues/66) (closed)
- Mirror sources: `src/fs/unmatched-transcripts.ts`, `src/core/unmatched-digest.ts`,
  `src/commands/transcripts.ts`, `src/daemon/worker.ts:316-402`, `src/commands/status.ts:64-135`
- #106 targets: `src/core/template-engine.ts:18-34`, `src/mcp/tools/draft-email.ts:30-31`,
  `src/fs/audit-log.ts:17-20`, `src/fs/contacts-writer.ts:54-57`, `docs/schemas.md:261-271`
