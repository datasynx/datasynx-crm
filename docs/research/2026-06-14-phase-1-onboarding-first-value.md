---
date: 2026-06-14T06:11:04+02:00
researcher: majone
git_commit: 12d1c78424cfb7a96345ad5b2d23a6ca8746cadb
branch: main
repository: datasynx-crm
topic: "ROADMAP next phase — Phase 1 (Onboarding & first-value): #75 unmatched conversations + #106 template variables"
tags: [research, codebase, conversations, routing, template-engine, draft-email, unmatched-queue, events, daemon]
status: complete
last_updated: 2026-06-14
last_updated_by: majone
---

# Research: ROADMAP Next Phase — Phase 1 (Onboarding & First-Value)

**Date**: 2026-06-14T06:11:04+02:00
**Researcher**: majone
**Git Commit**: 12d1c78424cfb7a96345ad5b2d23a6ca8746cadb
**Branch**: main
**Repository**: datasynx-crm

## Research Question

What is the current state of the codebase relevant to the **next phase** in
[`ROADMAP.md`](../../ROADMAP.md)? Per the roadmap, the next execution phase is
**Phase 1 — Onboarding & first-value (P0, directly serves the kill condition)**. With
[#103](https://github.com/datasynx/datasynx-crm/issues/103) delivered, the two remaining Phase 1 items are:

- **[#75](https://github.com/datasynx/datasynx-crm/issues/75)** — Unmatched conversations: event + daily digest + `resolve` command (mirror the closed #66 transcript pattern).
- **[#106](https://github.com/datasynx/datasynx-crm/issues/106)** — Auto-resolve sender/owner & contact first-name template variables in `draft_email`.

This document maps the existing code those two issues touch. It describes what exists
today — not what should change.

## Summary

**Phase 1 is two well-scoped, sandbox-capable issues that each have a complete, tested
template already in the repo to follow.**

- **#75 (unmatched conversations)** mirrors the fully-implemented #66 transcript flow.
  The conversation subsystem (`src/core/conversations.ts`) already persists every inbound
  message, routes it to a customer by **email only** (`resolveConversationSlug` →
  `routeMessage`), and on a no-match simply stores `slug: null` and continues. There is
  **no unmatched queue, no `conversation.unmatched` event, and no resolve/list-unmatched
  surface** for conversations today. Every piece needed to add them already exists for
  transcripts: the JSON store (`src/fs/unmatched-transcripts.ts`), the digest
  (`src/core/unmatched-digest.ts` → `queue.unmatched_digest`), the CLI subcommands
  (`src/commands/transcripts.ts`), and the daemon 06:00 cron hook (`src/daemon/worker.ts`).

- **#106 (template variables)** is concentrated in a **single 35-line function**,
  `buildVariablesFromCustomer` (`src/core/template-engine.ts:18-34`). It resolves 8
  variables today (`company`, `domain`, `email`, `stage`, `slug`, `date`, `year`, `month`)
  but **not** `firstName`, `senderName`, or `ownerName` — exactly the variables the #103
  starter templates and the `dxcrm template create` default body use. `draft_email`
  already merges `overrides` last (so manual overrides win), and there is a documented but
  unimplemented `{{ownerName}}` ("from `DXCRM_ACTOR`") in `docs/schemas.md`. The helper
  `getActor()` (`src/fs/audit-log.ts:17`) and `getPrimaryContact()`
  (`src/fs/contacts-writer.ts:54`) exist but are **not wired into the draft path**.

Both issues are sandbox-capable (no live credentials, no HF download) and follow the
standard 5-step working method in the [SOP](../next-session-sop.md).

---

## Detailed Findings

### Part A — #75: Unmatched Conversations

#### A.1 The #66 transcript pattern to mirror (reference implementation, all green)

**Queue store** — `src/fs/unmatched-transcripts.ts` (34 lines):
- `interface UnmatchedTranscript { filePath: string; addedAt: string; reason: "no_customer_match" | "no_customers_defined" }` (`:4-8`).
- Persists to `<dataDir>/.agentic/unmatched-transcripts.json` — a pretty-printed JSON array, via `src/fs/json-store.ts` (`readJsonFile`/`writeJsonFile`, atomic + creates parent dirs). Missing/invalid → `[]`.
- Exports: `readUnmatched(dataDir)` (`:14`), `appendUnmatched(dataDir, entry)` (`:18`), `clearUnmatched(dataDir)` (`:22`), `removeUnmatched(dataDir, filePath): boolean` (`:27-33`, returns `false` when nothing matched).

**Digest** — `src/core/unmatched-digest.ts`:
- `emitUnmatchedDigest(dataDir): Promise<{count, oldest} | null>` (`:16-34`). Empty queue → returns `null`, emits/logs nothing. Otherwise computes `oldest` (min `addedAt`), emits event **`queue.unmatched_digest`** with payload `{ count, oldest, refs }` (`refs` = first 20 `filePath`s) via `emitEvent` (`.catch(() => undefined)`), and `logger.warn("transcripts", "unmatched queue needs attention", {...})`.

**CLI** — `src/commands/transcripts.ts`:
- `resolve <ref>` → `runTranscriptsResolve(ref)` (`:111-120`): calls `removeUnmatched(dataDir(), ref)`; on `false` prints error + `process.exitCode = 1`; on success prints "Resolved …".
- `unmatched` listing (`:142-158`): `readUnmatched`, prints one line per entry `  <filePath>  (<reason>, <addedAt>)`, or a "no unmatched" line.
- `clear` (`:165-171`): `clearUnmatched`.
- Registered as `transcriptsCommand` (`:122-124`) with `.command(...).action(...)`; the parent command is added to the CLI in `src/commands/registry.ts:47,122`.
- `dataDir()` = `process.env.DXCRM_DATA_DIR ?? process.cwd()` (`:5`).

**Producers + `transcript.unmatched` event** — payload `{ source, ref, reason }`:
- `src/sync/transcript-discovery.ts` — Teams miss (`:104-117`, `ref = teams://onlineMeetings/<id>`, `source: "teams"`), Meet miss (`:180-195`, `ref = meet://<id>`, `source: "meet"`).
- `src/sync/transcript-watcher.ts` — private `recordUnmatched(dataDir, filePath, reason)` (`:184-196`, dynamic imports, `source: "file"`), called at `:126`, `:139`, `:154`.

**Daemon wiring** — `src/daemon/worker.ts`:
- The digest runs **inside the existing 06:00 cron** (the push-renewal job), not a dedicated cron: `new CronJob("0 6 * * *", …)` at `:316-317`; the digest call is `:386-392` (`await import("../core/unmatched-digest.js"); await emitUnmatchedDigest(DATA_DIR)` wrapped in try/catch). This is the seam to add a second digest for conversations.

**Tests (all under top-level `__tests__/`, Vitest + memfs):**
- `__tests__/fs/unmatched-transcripts.test.ts` — store read/append/clear, path assertion.
- `__tests__/core/unmatched-digest.test.ts` — empty no-op + `null`; non-empty emits `queue.unmatched_digest` with `{count, oldest, refs}`.
- `__tests__/commands/transcripts.test.ts` — `runTranscriptsResolve` removes one entry; unknown ref → `process.exitCode = 1`.
- `__tests__/sync/transcript-discovery.test.ts` — `transcript.unmatched` emits with `{source, reason}`; queue append.
- `__tests__/sync/transcript-watcher.test.ts` — file-path unmatched recording.

#### A.2 The conversations subsystem (the target of #75)

**Model & store** — `src/core/conversations.ts`:
- `interface Conversation { id; channel; threadKey; slug: string | null; contact; status; assignee?; ticketId?; messages[]; createdAt; lastMessageAt }` (`:17-46`). **The unmatched state is `slug: null`** — the conversation always persists.
- `ConversationChannel = "web" | "whatsapp" | "slack" | "telegram"`; `ConversationContact = { name?; email?; phone? }`.
- Store: `<dataDir>/.agentic/conversations/<id>.json`, one file per conversation; `id = conv_<12-char uuid slice>` (`:139`).
- Exported fns: `listConversations(dataDir, {status?, slug?, channel?})` (`:57-77`, no "unmatched" filter exists), `getConversation` (`:79-82`), `writeConversation` (`:84-86`), `resolveConversationSlug` (`:103-109`), `ingestInbound` (`:125-185`), `replyConversation`, `assignConversation`, `pollMessages`, `parseWhatsAppInbound`, `renderChatWidget`.

**Routing** — `src/sync/email-router.ts` (note: `src/core/routing.ts` is *unrelated* ticket-agent load-balancing — do not confuse):
- `resolveConversationSlug(dataDir, contact)` (`src/core/conversations.ts:103-109`): **email-only**. `if (!contact.email) return null;` then `routeMessage([contact.email], buildRoutingTable(dataDir))`. A WhatsApp message (phone only, no email) therefore always returns `null`.
- `buildRoutingTable(dataDir)` (`email-router.ts:75-91`): builds `{slug, domains[], emails[]}` per customer from `main_facts.md` front-matter (`domain`, `email`, `primary_contact`).
- `routeMessage(addresses, table)` (`email-router.ts:99-113`): two-pass — exact email match, then domain match; **returns `null` when nothing matches**.

**The current "unmatched" code path (what exists today):**
- New thread: `slug: resolveConversationSlug(...)` may be `null` (`conversations.ts:142`).
- Existing thread re-resolves only `if (!conv.slug)` (`:135`) — retries on later messages once an email is learned.
- CRM-timeline mirror (`appendInteraction`) is **skipped when `slug` is null** (`:156`) — an unmatched conversation never reaches a customer timeline.
- Events still emit with `slug: conv.slug ?? ""` (empty string when unmatched) (`:171-177`).
- **No queue, no event, no alert.** Visible only via `list_conversations` / `dxcrm inbox` as `(unlinked)` (`src/commands/inbox.ts:37,52`).

**Ingestion call sites** — `src/mcp/routes/conversation-routes.ts` (`registerConversationRoutes(app, dataDir)` at `:28`):
- `POST /chat` (`:39-68`) → `ingestInbound(channel: "web", threadKey: sessionId, contact:{name?,email?}, text)` (`:61`).
- `POST /webhooks/whatsapp` (`:104-130`) → `parseWhatsAppInbound` then `ingestInbound(channel: "whatsapp", threadKey: m.from, contact:{phone, name?}, text)` (`:122`). No email → always unmatched at ingest.
- Neither handler has an unmatched branch; both respond success regardless of `slug`.

**Existing conversation events** (`emitEvent` from `src/core/webhooks.js`, all in `conversations.ts`): `conversation.created` / `conversation.message` (`:171-177`), `conversation.replied` (`:256-262`), `conversation.assigned` (`:324-329`), `conversation.escalated` (`:332-336`). **No `conversation.unmatched` today.**

**Tests:**
- `__tests__/core/conversations.test.ts` — `ingestInbound` routes `jane@acme.com → acme`; the unmatched-phone case asserts `slug` is `null` but the conversation is still tracked (`:43-67`).
- `__tests__/sync/email-router.test.ts` — `routeMessage` "returns null when nothing matches (unrouted)" (`:82-84`).
- `__tests__/mcp/conversation-routes.test.ts` — HTTP-level ingest, honeypot, rate-limit, WhatsApp verify+POST.

### Part B — #106: Auto-Resolve Template Variables

#### B.1 The engine — `src/core/template-engine.ts` (35 lines, the whole surface)
- `interpolate(template, vars)` (`:7-12`): the only renderer; **unresolved `{{key}}` is kept literally** (no error, no blanking); `undefined` == missing.
- `extractVariables(template)` (`:14-16`): returns variable names found (with duplicates).
- `buildVariablesFromCustomer(dataDir, slug)` (`:18-34`): reads `MainFacts` (`.catch(() => null)`), returns 8 keys:

  | Variable | Source | Fallback |
  |---|---|---|
  | `company` | `MainFacts.name` | `slug` |
  | `domain` | `MainFacts.domain` | `""` |
  | `email` | `MainFacts.email` | `""` |
  | `stage` | `MainFacts.relationship_stage` | `""` |
  | `slug` | argument | always set |
  | `date` | `now.toLocaleDateString("de-DE")` | always set |
  | `year` | `now.getFullYear()` (number) | always set |
  | `month` | `now.toLocaleDateString("de-DE", {month:"long"})` | always set |

  **Not resolved:** `firstName`, `senderName`, `ownerName`. The `de-DE` locale on `date`/`month` (`:30,32`) is intentionally left to i18n issue #83 (per #106).

#### B.2 `draft_email` — `src/mcp/tools/draft-email.ts`
- `handleDraftEmail` (`:9-94`). Merge: `const autoVars = await buildVariablesFromCustomer(dataDir, input.slug); const vars = { ...autoVars, ...(input.overrides ?? {}) };` (`:30-31`) — **overrides win** (spread last). `overrides` is `Record<string,string>` ("Override any template variable", schema `:108-111`).
- Subject + body both interpolated with the merged `vars` (`:33-34`); echoed back as `resolvedVariables` (`:86`). `to` is read from `MainFacts.email` separately (`:70-71`).
- **No actor/contact lookup here** — `firstName`/`senderName` resolve only if passed via `overrides`.

#### B.3 Customer & contact model (where `firstName` could come from)
- `MainFacts.primary_contact: z.string().optional()` (`src/schemas/main-facts.ts:12`) — a free-text string, no structured given-name. **Not read** by `buildVariablesFromCustomer`.
- `CustomerContact` (`src/fs/contacts-writer.ts:6-19`) at `customers/<slug>/contacts.json` — has a single full `name` string (**no `firstName`/`givenName` field**), plus `isPrimary`.
- `getPrimaryContact(dataDir, slug)` (`src/fs/contacts-writer.ts:54-57`): returns `isPrimary` contact, else first, else `null`. **Not imported** by the draft path today.

#### B.4 `DXCRM_ACTOR`
- Canonical resolver `getActor()` (`src/fs/audit-log.ts:17-20`): trimmed `DXCRM_ACTOR`, else `"system"`. Widely imported, but **not by `draft-email.ts` / `template-engine.ts`**.
- Direct reads with own fallbacks: `src/core/rbac.ts:91`, `src/mcp/tools/list-customers.ts:45`, `src/mcp/tools/get-customer-context.ts:67`, `src/commands/session.ts:87`.
- Set per-request at `src/mcp/server.ts:268` from request auth.
- Note: `getActor()` returns a raw identity (e.g. `"alice"`), not a display name.

#### B.5 Starter templates (#103) that use the unresolved variables
- `src/core/starter-content.ts` — all 5 starters use `{{firstName}}` (greeting) + `{{senderName}}` (sign-off): `starter-cold-intro` (`:24-40`), `-followup-1` (`:41-58`), `-breakup` (`:59-76`), `-post-demo-recap` (`:77-98`), `-ticket-acknowledgement` (`:99-116`). `CURRENT_STARTER_SEED_VERSION = 1` (`:15`).
- `dxcrm template create` default body (`src/commands/template.ts:73-74`): `Hi {{firstName}},\n\n[your message here]\n\nBest regards,\n{{senderName}}` (default `--lang de`).

#### B.6 Doc mismatch — `docs/schemas.md`
- "Standard template variables" table (`:261-271`) lists `{{customerName}}`, `{{contactEmail}}`, `{{dealValue}}`, `{{stage}}`, `{{ownerName}}` ("Account owner (from `DXCRM_ACTOR`)").
- `{{ownerName}}` is documented but **no code resolves it**. `{{senderName}}` and `{{firstName}}` (the ones the starters actually use) are **absent** from the table. Doc names also diverge from engine output (`customerName`/`contactEmail` vs the engine's `company`/`email`).

#### B.7 Tests
- `__tests__/core/template-engine.test.ts` — `interpolate` keeps `{{missing}}`; `buildVariablesFromCustomer` asserts `company`/`domain`/`slug`, `company` falls back to `slug`. **No test asserts `firstName`/`senderName`/`ownerName`.**
- `__tests__/mcp/tools/draft-email.test.ts` — "overrides take precedence" (`:67-79`); **"unresolved variables stay as `{{var}}`"** asserts the body still contains `{{firstName}}` (`:81-90`) — this assertion would change once auto-resolution lands.

---

## Code References

**#75 — mirror source (transcripts):**
- `src/fs/unmatched-transcripts.ts:4-33` — queue store (interface + read/append/clear/remove)
- `src/core/unmatched-digest.ts:16-34` — `emitUnmatchedDigest` → `queue.unmatched_digest`
- `src/commands/transcripts.ts:111-171` — `resolve`/`unmatched`/`clear` subcommands
- `src/sync/transcript-discovery.ts:104-117,180-195` — `transcript.unmatched` producers
- `src/sync/transcript-watcher.ts:184-196` — file-path producer
- `src/daemon/worker.ts:316-317,386-392` — 06:00 cron + digest call

**#75 — target (conversations):**
- `src/core/conversations.ts:17-46` — `Conversation` type (`slug: string | null`)
- `src/core/conversations.ts:103-109` — `resolveConversationSlug` (email-only)
- `src/core/conversations.ts:125-185` — `ingestInbound` (`:142` null slug, `:156` skip timeline, `:171-177` events)
- `src/sync/email-router.ts:99-113` — `routeMessage` (returns `null` on no match)
- `src/mcp/routes/conversation-routes.ts:39-68,104-130` — web-chat + WhatsApp ingestion

**#106 — engine + callers:**
- `src/core/template-engine.ts:18-34` — `buildVariablesFromCustomer` (the function to extend)
- `src/mcp/tools/draft-email.ts:30-31` — auto/override merge
- `src/fs/audit-log.ts:17-20` — `getActor()` (`senderName`/`ownerName` source)
- `src/fs/contacts-writer.ts:54-57` — `getPrimaryContact()` (`firstName` source)
- `src/schemas/main-facts.ts:12` — `primary_contact` free-text string
- `src/core/starter-content.ts:24-116` — starters using `{{firstName}}`/`{{senderName}}`
- `docs/schemas.md:261-271` — standard-variables table (the doc/code mismatch)

---

## Architecture Documentation

**The "unmatched queue" pattern (established by #66).** A no-match outcome is captured in
a dedicated `.agentic/<thing>.json` array store, an instantaneous
`<domain>.unmatched` event is emitted at queue time (best-effort, `.catch(() => undefined)`),
a daily daemon cron summarizes the backlog into a `queue.<...>_digest` event + `logger.warn`,
and operator CLI subcommands (`unmatched`/`resolve <ref>`/`clear`) read and drain the queue.
Stores are built on `src/fs/json-store.ts` (atomic writes, dir creation, `[]` fallback).

**Email-only routing.** Inbound conversations match customers exclusively by email address
via `email-router.ts` (`routeMessage`), exact-email then domain, `null` on miss. There is no
phone/`wa_id`-based matching, so WhatsApp conversations are structurally unmatched at ingest.

**Single-function variable resolution.** All template-variable derivation lives in one place
(`buildVariablesFromCustomer`); `draft_email` merges caller `overrides` last so any variable is
manually overridable. `interpolate` is intentionally lossless on unknown variables (keeps the
literal `{{key}}`).

**MCP/CLI bookkeeping (if #75 adds an MCP tool).** Current `TOOL_COUNT = 82`
(`src/setup/harness-content.ts:119`); `ALL_TOOLS` array (`:5-116`); registration in
`createMcpServer()` (`src/mcp/server.ts`); RBAC groups (`src/core/rbac.ts:16-57`, incl.
`CONVERSATION_TOOLS`); capabilities table (`src/mcp/capabilities.ts`); docs regenerate via
`npm run docs:generate` (AUTOGEN blocks in `docs/cli-reference.md` "Complete Command Index (69)"
and `docs/mcp-tools.md` "Complete Tool Index (82)"). Event names are passed as raw strings to
`emitEvent` (`src/core/webhooks.ts:113`) — there is no union type / central registry of event
names. Outbound webhook delivery matches `"*"`, exact, and `"prefix.*"` glob patterns
(`matchSubscriptions`, `webhooks.ts:68`).

**Existing CLI surface for conversations.** `dxcrm inbox` (`inboxCommand`, registered
`registry.ts:48,123`) provides `list`/`show`/`reply`/`assign` and renders unmatched as
`(unlinked)`. #75's `resolve` could extend this command or a new `conversations` command.

---

## Historical Context (from docs/research/)

- `docs/research/2026-06-11-issue-74-coverage-gaps.md` — coverage edge gaps (sibling P1 sandbox work).
- `docs/research/2026-06-11-issue-80-english-only-policy.md` — English-only enforcement; relevant to the `de-DE` locale note in `template-engine.ts` (deferred to #83, not #106).
- `docs/research/2026-06-11-issue-85-dependency-cleanup.md` and `2026-06-12-issue-93-install-footprint.md` — Phase 2 (footprint) research, the parallel cluster under epic #99.

The roadmap and SOP both record that #75 is intended to be pulled in **once the M2 hardening
test (#73) confirms it is needed**, but is "well-specified and sandbox-capable" and can proceed
on that basis. #106 is on the same time-to-first-value thread as the delivered #103.

## Related Research

- [`2026-06-11-issue-74-coverage-gaps.md`](2026-06-11-issue-74-coverage-gaps.md)
- [`2026-06-11-issue-80-english-only-policy.md`](2026-06-11-issue-80-english-only-policy.md)

## Open Questions

These are factual unknowns surfaced by the mapping (not recommendations):

- **#75 ref format:** transcripts use pseudo-URI refs (`teams://…`, `meet://…`, file paths).
  Conversations are keyed by `id` (`conv_…`) and `threadKey`; which becomes the `resolve <ref>`
  key is a design choice not yet made in code.
- **#75 resolve semantics:** transcript `resolve` only removes from the queue (after a manual
  `main_facts` fix). For conversations, "resolve" in the issue says "assign to a customer slug" —
  whether that re-links the persisted conversation (`assignConversation` exists, `conversations.ts:279-346`)
  or only drains a queue entry is unspecified in code today.
- **#75 enqueue trigger:** unlike transcripts (a discrete discovery step), conversations re-resolve
  `slug` on every message while `slug` is null (`conversations.ts:135`). Where exactly a
  `conversation.unmatched` event should fire (first message only vs. each) is not yet defined.
- **#106 `firstName` derivation:** neither `MainFacts.primary_contact` (free string) nor
  `CustomerContact.name` has a dedicated first-name field — deriving `firstName` requires a name
  split, and the two contact sources (`primary_contact` vs `contacts.json`) could disagree.
- **#106 `senderName` quality:** `getActor()` returns a raw identity (e.g. `"alice"`), possibly
  `"system"` — whether that is an acceptable display name in a signature is a product call.
