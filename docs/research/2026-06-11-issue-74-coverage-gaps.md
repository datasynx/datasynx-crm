---
date: 2026-06-11T00:00:00+09:00
researcher: majone
git_commit: 487021e8e60f05071ada01ccad41182999e6156f
branch: main
repository: datasynx-crm
topic: "Decision + current-state map for the next issue to implement (#74 critical-path coverage gaps)"
tags: [research, codebase, coverage, testing, calendly, llm, calendar-availability, issue-74]
status: complete
last_updated: 2026-06-11
last_updated_by: majone
---

# Research: Which open issue to implement next, and the current state of its targets

**Date**: 2026-06-11T00:00:00+09:00
**Researcher**: majone
**Git Commit**: `487021e8e60f05071ada01ccad41182999e6156f`
**Branch**: `main`
**Repository**: datasynx-crm

## Research Question

Review all open GitHub issues, decide (autonomously) which one makes sense to implement
now, and document the decision plus the current state of the chosen target in a research
markdown — describing what exists today, not what should change.

## Decision

**Implement [#74 — "Close remaining critical-path coverage gaps (calendly, llm providers,
calendar-availability)"](https://github.com/datasynx/datasynx-crm/issues/74) next.**

### Why this one (decision rationale)

The open-issue landscape on `main` at this commit:

| Issue | Theme | Sandbox-capable now? | Status |
|---|---|---|---|
| #73 | M2 — 7-day HubSpot-free hardening test (the kill condition) | **No** — needs a real/test tenant + live credentials; operator/dogfooding task | Bottleneck, not codeable here |
| #74 | Coverage gaps: `sync/calendly.ts`, `core/llm.ts`, `sync/calendar-availability.ts` | **Yes** — stubbed `fetch`/`https`, no live network | **Chosen** |
| #75 | Unmatched conversations (event + digest + `resolve`), mirror of #66 | Yes (well-specified) | Explicitly gated: "pull in once the M2 hardening test confirms it's actually needed" |
| #80 | Enforce English-only across the codebase + CI guard | Yes | Viable, but broad sweep + lower direct risk-reduction |
| #20 | Evaluate/upgrade embedding model with a real corpus | **No** — HF model download blocked in sandbox | Gated by environment |
| #70 | Triage Dependabot critical alert | **No** — `npm audit` clean locally; needs operator input | Operator |
| #76–#79 | M4 (Slack channel, web dashboard, more LLM providers, plugin marketplace) | No | Deliberately gated behind passing the kill condition |

- The actual bottleneck (#73) cannot be driven from a sandbox — it needs live tenants and
  daily real usage. M4 (#76–#79) is intentionally gated until the kill condition passes.
  #20/#70 are environment/operator gated. That leaves the sandbox-capable P1 block: #74,
  #75, #80.
- Among those, **#74 is the highest-confidence, lowest-risk pick that directly protects the
  kill condition.** All three target modules are credential-gated provider paths
  (`calendly` scheduling, local-LLM provider, calendar free/busy) that will execute *live*
  during the M2 hardening test. Covering their success/error/parse branches now hardens the
  exact code that M2 exercises, before friction shows up in real usage.
- It is purely additive (tests + minimal testability refactors, no behavior change), so it
  carries effectively no regression risk, and it buys headroom above the 80 % branch gate.
- #75 is well-specified but explicitly deferred in both the issue and the SOP until M2
  feedback proves it is needed; building it now risks speculative work. #80 is valuable but
  a broad translation sweep with less direct risk-reduction for the kill condition.

This matches the documented priority in `docs/next-session-sop.md` §3 (P1, sandbox-capable),
which lists #74 first in that tier.

---

## Summary (current state of the #74 targets)

The coverage gate (`vitest.config.ts`) enforces **80 %** for lines/branches/functions/
statements, scoped to `src/**/*.ts` and excluding `src/cli.ts`, `src/daemon/worker.ts`,
`src/index.ts`, `src/commands/**`. Measured at this commit, the three target files sit
below that line:

| File | % Stmts | % Branch | % Funcs | % Lines | Uncovered lines |
|---|---|---|---|---|---|
| `src/sync/calendly.ts` | **0** | **0** | **0** | **0** | 20–83 (entire body) |
| `src/core/llm.ts` | 81.89 | **65.78** | 80.95 | 85.1 | 142–182, 200, 343 |
| `src/sync/calendar-availability.ts` | 77.27 | **63.63** | 87.5 | 76.19 | 28–32, 60, 95–99 |

`calendly.ts` has **no test file at all**. `llm.ts` has a substantial test
(`__tests__/core/llm.test.ts`, 369 lines) covering the Anthropic path but not the
local-provider path or `recordCall`. `calendar-availability.ts` has no test file; its
covered lines come incidentally from the booking flow.

---

## Detailed Findings

### 1. `src/sync/calendly.ts` — 0 % covered, no test

A small Calendly REST client over a raw `https.request` legacy path. Three exported/internal
surfaces, all uncovered:

- **`calendlyRequest<T>(apiKey, path)`** ([calendly.ts:19-42](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/sync/calendly.ts#L19-L42)) —
  dynamically `import("https")`, issues a GET with a Bearer header, accumulates `data`
  chunks, and on `end` either `JSON.parse`-resolves or rejects with
  `Invalid JSON from Calendly API: …`. `req.on("error", reject)` forwards transport errors.
  Branches: success parse, invalid-JSON reject, transport-error reject.
- **`getCurrentUserUri(apiKey)`** ([calendly.ts:44-47](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/sync/calendly.ts#L44-L47)) —
  calls `/users/me`, returns `resource.uri`.
- **`listEventTypes(apiKey)`** ([calendly.ts:49-64](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/sync/calendly.ts#L49-L64)) —
  resolves the user URI, URL-encodes it, fetches `/event_types?user=…&active=true`, maps
  the API shape (`scheduling_url` → `schedulingUrl`).
- **`getSchedulingLink(apiKey, eventTypeSlug, prefill?)`** ([calendly.ts:66-84](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/sync/calendly.ts#L66-L84)) —
  finds an event type by exact-slug **or** case-insensitive name-substring match; throws
  `Event type '…' not found in Calendly` when missing; appends `name`/`email` query params
  via `URLSearchParams` when `prefill` is set. Branches: exact-slug hit, name-substring hit,
  not-found throw, with/without prefill, params-empty/non-empty.

Note the related file `src/sync/calendly-webhook-handler.ts` already has a test
(`__tests__/sync/calendly-webhook-handler.test.ts`) — that is the *inbound webhook*
handler, distinct from this *outbound REST client*.

### 2. `src/core/llm.ts` — local-provider path + usage recording uncovered

The Anthropic path (`summarizeEmail`, `recognizeCustomer`, `callLlm` happy/circuit/guard
paths, `mapCsvFields` Anthropic branch) is well covered by `__tests__/core/llm.test.ts`.
The uncovered branches:

- **`recordCall(model, in, out, ctx)`** ([llm.ts:136-152](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/core/llm.ts#L136-L152)) —
  resolves `DXCRM_DATA_DIR` (or `cwd`), dynamically imports `./usage.js` and calls
  `recordUsage`, spreading `slug`/`tool` only when present. Lines 142–152 uncovered.
- **`callLocalLlm(masked, ctx)`** ([llm.ts:159-183](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/core/llm.ts#L159-L183)) —
  the D17 OpenAI-compatible local path. Reads `localLlmConfig()`, POSTs to
  `${baseUrl}/chat/completions` via global `fetch`, throws `Local LLM error <status>` on
  non-OK, throws `No text response from local LLM` when `choices[0].message.content` is
  empty, and calls `recordCall` only when `data.usage` is present. Lines 159–183 uncovered.
- **`callLlm` local-provider branch** ([llm.ts:199-201](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/core/llm.ts#L199-L201)) —
  when `provider !== "anthropic"`, routes through the circuit breaker into `callLocalLlm`,
  then `guardLlmResponse` + `unmask`. Line 200 uncovered. (The Anthropic branch and the
  "ANTHROPIC_API_KEY not set" throw at line 191 are covered.)
- **`mapCsvFields` non-text-block fallback** ([llm.ts:341-343](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/core/llm.ts#L341-L343)) —
  line 343: the branch where the Anthropic response has no text block → falls back to
  `mapCsvFieldsHeuristic`. (The JSON-parse-error and outer-catch fallbacks here are
  reachable but the no-text-block branch is the uncovered one.)

Provider selection lives in `src/core/compliance.ts`:
- **`llmProvider()`** ([compliance.ts:45-49](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/core/compliance.ts#L45-L49)) —
  reads `DXCRM_LLM_PROVIDER`, lower-cased; accepts `ollama|openai|local`, else defaults
  `anthropic`.
- **`localLlmConfig()`** ([compliance.ts:57-62](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/core/compliance.ts#L57-L62)) —
  `DXCRM_LLM_BASE_URL` (default `http://127.0.0.1:11434/v1`), `DXCRM_LLM_MODEL`
  (default `llama3.1`).

`callLlm` also composes opt-in `neutralizeUntrusted`/`guardrailsEnabled` (guardrails),
`maskPii`/`piiMaskingEnabled` (PII masking) and `guardLlmResponse` (`src/core/input-guard.ts`,
size guard) around both provider paths ([llm.ts:185-218](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/core/llm.ts#L185-L218)).

### 3. `src/sync/calendar-availability.ts` — error/catch branches uncovered

Free/busy + event-create adapter for the native scheduler (#53), local-first by design.
Uncovered branches are the failure paths:

- **`getBusyIntervals` catch** ([calendar-availability.ts:27-33](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/sync/calendar-availability.ts#L27-L33)) —
  lines 28–32: when `busyForRep` rejects, logs `logger.warn("booking", …)` and treats the
  rep as free (`[]`). `busyForRep` currently always returns `[]`
  ([line 69-72](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/sync/calendar-availability.ts#L69-L72)),
  so exercising the catch requires injecting/forcing a rejection.
- **`localBookingsBusy` catch** ([calendar-availability.ts:42-62](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/sync/calendar-availability.ts#L42-L62)) —
  line 60: reads `.agentic/bookings.ndjson`, parses NDJSON, filters by rep + overlap with
  `range`; the `try/catch` returns `[]` on malformed content. The happy path is partly
  exercised; the malformed-line catch (line 60) is uncovered.
- **`createCalendarEvent` catch** ([calendar-availability.ts:80-101](https://github.com/datasynx/datasynx-crm/blob/487021e8e60f05071ada01ccad41182999e6156f/src/sync/calendar-availability.ts#L80-L101)) —
  lines 95–99: currently always logs `logger.info` and returns `null` (no provider wired);
  the `catch` warn-branch (95–99) is unreachable without forcing the `try` to throw.

> Documentary note (not a recommendation): `busyForRep` and the `createCalendarEvent` `try`
> body are deliberate offline no-ops at this commit, so their failure branches have no
> natural trigger from outside. Covering them is a testability question for the
> implementation phase, not part of this map.

---

## Test patterns that already exist (to mirror)

The repo has two established, distinct stubbing idioms for credential-gated network code:

1. **Injected `fetchFn` dependency** — used where the function signature accepts a
   `fetchFn` param. Reference: `__tests__/sync/subscription-create.test.ts` defines a local
   `okFetch(payload)` helper returning `vi.fn().mockResolvedValue({ ok: true, json: async
   () => payload })` and passes `fetchFn as never`. Also `__tests__/sync/transcript-
   discovery.test.ts` (`buildMicrosoftRenewFn(token, fetchFn)`, `fetchTeamsAttendees(…,
   fetchFn)`).
   - `calendly.ts` and `llm.ts` do **not** currently take an injectable `fetch`/`https`
     (calendly uses `import("https")`; `callLocalLlm` uses global `fetch`) — see the
     "minimal testability refactor" note below.

2. **`vi.mock("@anthropic-ai/sdk")`** — used for the Anthropic SDK. Reference:
   `__tests__/core/llm.test.ts:4-30` mocks the default export to expose a shared
   `__mockCreate` `vi.fn()`, imports the module under test *after* the mock, and uses
   `resetLlmClient()` / `resetLlmCircuit()` in `beforeEach`. PII/guardrails env vars are
   cleaned up in `afterEach`.

3. **memfs for filesystem** — `vol.reset()` + `vol.fromJSON(...)` in `beforeEach`
   (subscription-create test). Relevant for `localBookingsBusy` reading
   `.agentic/bookings.ndjson`.

Global `fetch` (used by `callLocalLlm`) can be stubbed with `vi.stubGlobal("fetch", …)`;
the raw `https` module (used by `calendly.ts`) can be stubbed with
`vi.mock("https", …)` returning a fake `request` that drives the `data`/`end`/`error`
event callbacks, **or** the function can be refactored to accept an injected transport.
Which approach to take is an implementation-phase decision; both are consistent with the
existing patterns.

---

## Code References

- `src/sync/calendly.ts:19-84` — Calendly REST client (0 % covered, no test file)
- `src/core/llm.ts:136-183` — `recordCall` + `callLocalLlm` (local-provider path, uncovered)
- `src/core/llm.ts:199-201` — `callLlm` local-provider branch (line 200 uncovered)
- `src/core/llm.ts:341-343` — `mapCsvFields` no-text-block fallback (line 343 uncovered)
- `src/core/compliance.ts:45-62` — `llmProvider()` + `localLlmConfig()` (provider selection)
- `src/sync/calendar-availability.ts:27-33,42-62,80-101` — free/busy + event-create catch paths
- `__tests__/core/llm.test.ts:1-369` — existing Anthropic-path test (mock idiom)
- `__tests__/sync/subscription-create.test.ts:9-16` — `okFetch` injected-fetch helper
- `__tests__/sync/transcript-discovery.test.ts:253-320` — injected `fetchFn` usages
- `vitest.config.ts:15-30` — coverage provider/include/exclude + 80 % thresholds

## Architecture Documentation

- **Tests** live in a top-level `__tests__/` tree mirroring `src/` (e.g.
  `__tests__/sync/…`, `__tests__/core/…`), with `__tests__/setup.ts` as the global setup.
  Test glob: `__tests__/**/*.test.ts`.
- **Coverage gate**: v8 provider, `src/**/*.ts` included, CLI/entry/`commands/**` excluded
  (those are exercised by e2e CLI workflow tests), 80 % on all four metrics.
- **Timezone pin**: the whole suite runs under `TZ=Asia/Tokyo` (UTC+9, no DST) so
  local-vs-UTC date bugs surface in CI. Date-boundary math must use `Date.UTC`/`getUTC*`.
- **Credential-gated = offline no-op**: provider integrations degrade to a safe local
  default with no credentials; tests exercise them with injected deps or stubbed
  `fetch`/`https`, never real network (per SOP §4 "Lessons Learned").
- **Module-global state reset**: circuit breakers / rate-limiters are module-global; tests
  reset them in `beforeEach` (`resetLlmCircuit`, `resetLlmClient`, `reset<X>Guards`).

## Historical Context (from docs/)

- `docs/next-session-sop.md` §0 (priority table) and §3 (strategy) — lists #74 as the first
  sandbox-capable P1 item; #73 (M2) is the bottleneck operator task; M4 (#76–#79) is gated.
- `docs/next-session-sop.md` §4 — "Credential-gated = offline No-op: test with injected
  deps or stubbed `fetch`" naming `subscription-create.ts`, `doctor-integrations.ts`,
  `transcript-discovery.ts` as reference patterns.
- Issue #74 body — current coverage was raised from 77.7 % (#69) to ~80.1 %; these three
  modules were "deliberately deferred in the #69 closeout."
- `docs/roadmap.md` (M2) — the 7-day HubSpot-free run is the kill condition that gates M4.

## Related Research

- `docs/research/` previously held the interactions-storage / hybrid-search docs (removed in
  commit `4b442a2` once fully implemented). No current research doc covers #74 prior to this.

## Open Questions

- Whether to cover `calendly.ts` via a `vi.mock("https", …)` fake or by introducing an
  injected transport param (minimal testability refactor) — decided in the implementation
  plan, not here.
- Whether the genuinely unreachable catch branches in `calendar-availability.ts`
  (`busyForRep` always-`[]`, `createCalendarEvent` always-`null`) should be covered via a
  small testability seam or accepted as currently-inert — an implementation-plan call.
