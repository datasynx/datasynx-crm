# ROADMAP — DatasynxOpenCRM

> Status: 2026-06-13 · npm `datasynx-opencrm` 1.39.0+ · Phase: **Hardening & first external user**
>
> The **single roadmap** for the project: strategic steering (North Star, milestones,
> non-goals) **and** the issue-derived, priority-ordered execution plan. Operational
> session handoff (checklists, pitfalls, working method) lives in the
> [SOP](docs/next-session-sop.md); the public short version in the
> [README](README.md#roadmap). **Open work in detail = GitHub issues.**

---

## North Star

**Kill condition:** the first external user uses `dxcrm` **daily for 7 days without HubSpot**.

Every prioritization is measured against exactly one question: *does it bring the first
external user closer to "7 days without HubSpot"?*

## Where We Stand

- **Phases 1–5 + M1 + the M3 sandbox portion completed.** 82 MCP tools · 69 CLI commands ·
  local Markdown/NDJSON stores · ~3736 tests green · coverage gate (80% branches) green.
  Delivery detail: git history and closed issues (#61–#69, #71, #72, #74, #80, #70).
- **Bottleneck:** many live paths are credential-gated no-ops. Core logic and routing are
  tested, but Teams/Meet subscriptions, WhatsApp sending, calendar free/busy, and Stripe
  do not run offline. The path to the kill condition runs through **activating & hardening**,
  not more feature breadth.

## The one manual gate — M2 (#73)

The kill condition itself is **[#73](../../issues/73) — the 7-day HubSpot-free hardening
test**. It is an **operator / dogfooding task**: it needs a real or test tenant with live
credentials and cannot be done from a sandbox/CI environment, so it is **not part of the
execution phases below**. It is, however, *the* bottleneck — friction found during the run
spawns the tightly-scoped issues (pattern: #41) that feed the phases. Entry point:
`dxcrm doctor --integrations --live` must be green for the providers in use.

---

## Execution Phases

Issue-derived, clustered, and ordered by priority against the North Star. Manual/operator
tasks (#73) are excluded.

### Phase 1 — Onboarding & first-value *(P0 — directly serves the kill condition)*

Make a fresh install usable on day one and keep daily operation complete.

| Issue | Title | Why now |
|---|---|---|
| [#103](../../issues/103) | Seed starter email templates & sequences on init | On a fresh vault `draft_email` / `enroll_in_sequence` / template outreach are unusable until the user hand-authors files. Shortens time-to-first-value — the exact gap that blocks "7 days without HubSpot". |
| [#75](../../issues/75) | Unmatched conversations: event + daily digest + resolve command | Carries the proven #66 transcript pattern to web-chat/WhatsApp. Without it, inbound messages that don't route to a known customer silently fall through during daily use. Well-specified, sandbox-capable. |

### Phase 2 — Supply-chain & install footprint *(P1 — trust & deployability)*

A coherent cluster under epic **[#99](../../issues/99)**. Trim the ~1 GB consumer install
and remove deprecated/vulnerable transitives — **without dropping the ML stack** (embeddings
+ semantic search stay; product decision). Ordered by dependency, not just priority.

| Order | Issue | Title | Note |
|---|---|---|---|
| 1 | [#92](../../issues/92) | npm overrides don't reach consumers — deprecated/vulnerable transitives ship | Foundational: explains *why* config-only fixes can't propagate. Should model the consumer tree in the deprecation guard. |
| 2 | [#95](../../issues/95) | Drop `@huggingface/transformers`; own the embedding path | Highest-impact default win (−164 MB for **every** consumer). Makes `onnxruntime-node` a direct, version-controlled dep and unblocks #96/#97. Gated on vector-parity validation (needs a network-enabled env). |
| 3 | [#96](../../issues/96) | `onnxruntime-node` ships ~160 MB of foreign-platform binaries | Lands cleanly once #95 makes the runtime a direct dep (per-platform split / pin). |
| 4 | [#98](../../issues/98) | Make the tesseract.js OCR core an optional install (~44 MB) | Behavior trade-off (image OCR becomes opt-in) — needs a product call; sequence after #95. |
| 5 | [#97](../../issues/97) | Ship an official slim self-hosted Docker image (~550 MB) | Bakes the slim setup in so the self-hosted operator needs zero footprint knowledge. Gets smaller after #95. |
| — | [#99](../../issues/99) | **Epic: reduce the ~1 GB consumer install footprint** | Tracking issue for the cluster above. |

### Phase 3 — Robustness & maintainability *(P2)*

Reduce drift and make data-driven decisions on the ML default.

| Issue | Title | Why |
|---|---|---|
| [#102](../../issues/102) | Unify harness-file writing into a shared managed-section helper | Fixes silent staleness of embedded tool lists across upgrades and removes duplicated/divergent writer logic in 5 adapters (BEGIN/END markers, idempotent refresh). |
| [#20](../../issues/20) | Evaluate (and possibly upgrade) the embedding model with a real corpus | Harness already exists (`eval-embeddings`, `reindex`). Needs a representative fixtures set + HF model access; **no blind swap.** *Requires a network-enabled env and anonymized real-query data.* |

### Phase 4 — Internationalization *(P2)*

| Issue | Title | Why |
|---|---|---|
| [#83](../../issues/83) | Locale-aware outbound document & summary generation | Detect the client's language; outbound (quotes, drafts, NPS, sequences) in the client's language, internal content in the operator's. Restores e.g. German quote output without hardcoding, keeping the English-only **source** policy intact. |

### Phase 5 — Post-kill-condition expansion (M4) *(P3 — gated by M2)*

> **Do not start before the 7-day hardening test (#73) passes.** Design discussion may
> begin earlier. Listed for planning/visibility.

| Issue | Title | State |
|---|---|---|
| [#76](../../issues/76) | Slack: promote from incoming-webhook to a first-class notification channel | Elevation task — outbound, event hooks, and inbound already partially exist; gaps vs. the Telegram channel (setup command, doctor probe, two-way interactivity). |
| [#77](../../issues/77) | Optional read-only web dashboard | Data side largely exists (`/dashboard` route + WorkOS SSO); add a read-only, auth-gated, rate-limited view reusing the existing tile source. |
| [#78](../../issues/78) | Additional LLM providers for on-device summarization | Add providers (e.g. Ollama + one hosted) behind `core/llm.ts`, env-selectable; offline/local default unchanged. |
| [#79](../../issues/79) | Community plugin marketplace | Largest/most speculative M4 item — **needs a design proposal merged first** (public plugin spec, registry index, security/sandboxing, `dxcrm plugin search\|install\|remove\|list`). |

---

## Milestone mapping

| Milestone | State | Covers |
|---|---|---|
| **M1 — Live-ready** *(P0)* | ✅ completed 2026-06-10 | Every core integration activatable for real; public endpoints hardened (#61–#64). Entry point: `dxcrm doctor --integrations --live`. |
| **M2 — 7-day hardening test** *(P1, bottleneck)* | ⏳ **#73** (manual gate) | The kill condition itself. → Phase 1 reduces friction going into it. |
| **M3 — Quality & robustness** *(P2/P3)* | partly done (#65–#69, #74) | Open: Phase 1 #75, Phase 3 #20. |
| **M4 — After the kill condition** *(P3, gated)* | not started | Phase 5: #76, #77, #78, #79. |
| **Footprint & supply-chain** *(P1, newer)* | open | Phase 2: epic #99 + #92/#95/#96/#97/#98. |
| **Internationalization** *(P2, newer)* | open | Phase 4: #83. |

## Sequencing & Dependencies

```
M1 (Live-ready) ──→ M2 / #73 (7-day hardening test) ──→ M4 / Phase 5 (growth)
        │
        ├─ Phase 1 (#103, #75) feeds M2 — reduce day-one friction first
        ├─ Phase 2 (#92 → #95 → #96/#98/#97) runs in parallel; #95 unblocks #96/#97
        └─ Phase 3 (#102, #20) & Phase 4 (#83) individually pickable, block nothing
```

- **M2 requires M1** — without a return channel, subscription creation, and setup docs, an
  honest hardening test is not possible.
- **Phase 2 dependency order matters:** #92 explains the constraint; #95 (drop transformers)
  is the enabler that makes #96 and a smaller #97 possible.
- **#20 is environment-dependent** (HF model access) — pull it in as soon as such an
  environment is available; no embedding default change without measurement.
- **M4 / Phase 5 is hard-gated by M2** — no new feature breadth before the kill condition passes.

## Non-Goals (deliberate)

- No new feature surfaces before M2 (the bottleneck is activation, not breadth).
- No embedding default change without measurement (the #20 rule).
- No removal of the ML stack — embeddings + semantic search are core (the #99 constraint).
- No postinstall file-prune (contradicts #88; fragile under hoisting / `npm ci` integrity).
- No custom web UI beyond portal + chat widget before M4.
- No change to strategic direction, kill conditions, or external contracts without asking
  (see [`CLAUDE.md`](CLAUDE.md)).

## Maintenance

Updated at every milestone completion and on new insight from the hardening test.
Operational details and lessons learned belong in the [SOP](docs/next-session-sop.md), not here.
