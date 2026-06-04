# Future-Feat.md — Roadmap zum konkurrenzfähigen, agenten-nativen CRM

> **Quellen:** `ResearchCRM.md` (Markt & Use-Cases 2026) + explizite Produktanforderungen.
> **Verhältnis zu den anderen Plänen:** `plan.md` = Phase 1–4 (fertig) · `next-plan.md` = Metadaten/MCP/
> Enterprise-Ausbau (umgesetzt, 56 Tools) · **`Future-Feat.md` = Wettbewerbs-Feature-Tiefe + neue
> Pflicht-Module**, mit denen opencrm den etablierten CRMs (Salesforce/HubSpot/Zoho) und den AI-natives
> (Attio/Day.ai/Clay) wirklich gefährlich wird.

---

## 0. Positionierung & Scope-Grenze (wichtigste Entscheidung)

**Wir bauen den Daten-, Kontext-, Memory-, Governance- und Observability-Layer für Agenten — nicht die
Agenten-Runtime.** Der Host (Claude Agent SDK / Mastra / Hermes) plant, denkt und führt aus; opencrm
liefert über MCP die *Tools, Resources, Prompts, Erinnerungen, SOPs, Leitplanken und Kostentransparenz*.

**NICHT in unser npm (das können die Frameworks):**
- Agent-Loop / Reasoning-Engine, Planning, Tool-Calling-Mechanik
- Voice/Realtime-Speech, Multimodalität
- LLM-Provider-Plumbing (Streaming, Retries, Modellwahl) — wir nutzen es nur (z. B. `callLlm`)
- Multi-Agent-*Ausführung* (wir liefern nur Routing/Handoff-Entscheidung + Audit, s. N6-2)

**Sehr wohl unser Kern (der Moat):** local-first Daten, Markdown-SoT, Kontext-Builder, Memory, SOPs,
HITL/Approval, RBAC + Field-ACL, Audit, Backup, Vault, Token-Kosten je Kunde, Compliance.

**Markt-Realismus (ResearchCRM):** HITL + Datenqualität schlagen autonome Cold-Outbound-Bots
(50–70 % Tool-Churn p. a., >40 % agentic-Projekte abgebrochen). Wir setzen auf **verlässliche, messbare
HITL-Features mit Provenance** statt „robotische Vollautonomie".

---

## 1. Pflicht-Module (deine expliziten Anforderungen)

Status-Legende: ✅ vorhanden · 🟡 teils vorhanden, ausbauen · 🔲 neu. Aufwand S/M/L.

### F1 · Backup von **allem** — Strategie + Funktion · 🟡→ausbauen · M
- **Ziel:** Ein Befehl sichert *den gesamten Zustand* verschlüsselt, verifizierbar, wiederherstellbar, offsite.
- **Vorhanden:** `dxcrm backup` (ZIP, SHA-256-Integrität, Schedule, Retention, Remote-Upload S3/rsync,
  `verifyBackupFile`, `runRestore`) + AES-256-GCM (`encryption.ts`).
- **Neu/ausbauen:** Backup-Scope **vollständig** über `customers/` **und** `.agentic/` (Schema, Memories,
  SOPs, Vault, Webhooks, Tokens, RBAC, Segmente, Journeys) garantieren; **verschlüsselte** Backups
  per Default (Vault-Key); **Restore-Drill** (automatischer Test-Restore in tmp + Integritätsreport);
  **3-2-1-Strategie** dokumentiert; Pre-/Post-Backup-Webhook-Event (`backup.completed`).
- **Akzeptanz:** Round-Trip-Test backup→restore stellt jeden Datentyp wieder her; verschlüsseltes Backup
  ist ohne Key nicht lesbar; `dxcrm backup verify` bestätigt Integrität.

### F2 · Customized Tonalität **je Kunde** · 🟡→ausbauen · S
- **Ziel:** Jede generierte Kommunikation nutzt automatisch die kundenspezifische (oder globale) Tonalität.
- **Vorhanden:** `draft_email({ tone })` (LLM-Politur).
- **Neu:** **Tone-Profil** je Kunde (`main_facts`-Feld bzw. `.agentic/tone/<slug>.json`: formality,
  language, do/don't-Phrasen, Beispiel-Snippets) + **globales Default-Profil**; `resolveTone(slug)`
  (Kunde → fällt auf global zurück); automatisch in `draft_email`/Sequenzen/Journeys angewandt;
  `dxcrm tone set <slug> --formality formal --language de ...`.
- **Akzeptanz:** Ohne `tone`-Override nutzt `draft_email` das Kundenprofil; Fallback auf global.

### F3 · Human-in-the-Loop + Approval-Prozess · 🟡→ausbauen · M
- **Ziel:** Jede schreibende/aussendende Agenten-Aktion ist konfigurierbar freigabepflichtig — pro Kunde,
  pro Tool, pro Autonomie-Level. „Sichtbarkeit jedes Schritts" (IBM: 55 % HITL).
- **Vorhanden:** `approve_agent_action`, Deal-Agent mit `observe|suggest|act`, Audit-Log, RBAC.
- **Neu:** **Generischer Approval-Layer** — `requestApproval(action)` schreibt in eine Queue
  (`.agentic/approvals.json`); `dxcrm approvals list|approve|reject`; **Autonomie-Policy** je Kunde/Tool
  (`auto` | `approve` | `block`) in `.agentic/policy.json`; Integration als MCP-Gate vor schreibenden Tools;
  Benachrichtigung über vorhandenen Push/Telegram-Pfad.
- **Akzeptanz:** Ein als `approve` markiertes Tool erzeugt eine Pending-Approval statt auszuführen; nach
  `approve` wird ausgeführt + auditiert.

### F4 · Memories — **je Kunde UND global** · 🔲 neu · M
- **Ziel:** Der Agent merkt sich Gelerntes/Fakten dauerhaft (episodisch + semantisch), kundenspezifisch
  und global, und ruft es bei Bedarf ab (CoALA-Mapping).
- **Vorhanden als Bausteine:** LanceDB-Vektorsuche, `interactions.md` (episodisch), bi-temporaler Graph
  (semantisch), `buildContextBlock`.
- **Neu:** **Memory-Store** `.agentic/memory/global.md` + `customers/<slug>/memory.md` (typisierte
  Einträge: fact/preference/learning/instruction, mit Provenance + Zeitstempel + Confidence);
  `addMemory`, `searchMemory` (Hybrid, s. F8); Einbindung in `get_customer_context` (relevante Memories
  werden injiziert). MCP: `remember`, `recall`.
- **Akzeptanz:** `remember(slug, "zahlt immer per Rechnung")` → erscheint bei `recall`/im Kontext; globale
  Memories greifen kundenübergreifend.

### F5 · SOP-Modul (Standard Operating Procedures) + Hybrid-Search · 🔲 neu · M
- **Ziel:** Global oder je Kunde abgelegte **Arbeitsprozesse & Anweisungen**, die bei Aufgaben/Anfragen
  per Hybrid-Search gefunden und zur Erledigung herangezogen werden („so machen wir X").
- **Abgrenzung:** SOPs = *prozedural* (wie arbeiten) vs. Playbooks (Deal-Taktik) vs. KB (Kunden-Wissen).
- **Neu:** SOP-Store `.agentic/sops/<id>.md` (global) + `customers/<slug>/sops/` (kundenspezifisch),
  Frontmatter: title, scope (global|customer), triggers/keywords, tags; **Hybrid-Search** (F8) liefert
  passende SOPs zu einer Aufgabe; MCP-Tool `find_sops({ query, slug? })` + Resource `crm://sops`;
  `dxcrm sop add|list|search`. SOPs werden im Kontext/Prompt als „Vorgehensanweisungen" injiziert.
- **Akzeptanz:** `find_sops({ query: "Angebot erstellen", slug })` liefert kundenspezifische SOP vor
  globaler; Volltext + Vektor kombiniert.

### F6 · Lokaler Passwort-/Credential-Vault + GUI · 🔲 neu · L
- **Ziel:** Sichere lokale Ablage von Geheimnissen (API-Keys, Kunden-Zugänge) — global und je Kunde —
  mit GUI zum sicheren Speichern; local-first, kein Cloud-Secret-Store.
- **OSS-npm-Optionen (recherchiert — Lizenz vor Einsatz final prüfen):**
  | Option | Lizenz | Eignung |
  |---|---|---|
  | **kdbxweb** | MIT | KeePass-`.kdbx` lesen/schreiben in JS → portables, verschlüsseltes Vault-File; **GUI gratis via KeePassXC** (separate App, nur Dateiformat geteilt) |
  | **@napi-rs/keyring** | MIT | OS-Keychain (macOS/Win/Linux) für den **Master-Key** (Ersatz für archiviertes `keytar`) |
  | **age-encryption** | BSD/MIT | Moderne, einfache Datei-Verschlüsselung (X25519/ChaCha20) |
  | *(vorhanden)* `encryption.ts` | — | AES-256-GCM bereits im Projekt |
- **Empfehlung:** Vault als **verschlüsseltes File** (entweder `.kdbx` via `kdbxweb` für KeePassXC-Kompat
  ODER eigenes AES-256-GCM-File via `encryption.ts`), Master-Key über **@napi-rs/keyring** im OS-Keychain
  (Fallback: Passphrase). **GUI:** schlanke lokale Web-GUI über den vorhandenen HTTP-Server
  (`dxcrm vault serve`, hinter der Token-Auth N1-4) ODER KeePassXC als externe GUI bei `.kdbx`.
  Secrets werden **nie** im Klartext geloggt/committet (vgl. bestehende npm-Token-Regel).
- **Akzeptanz:** `dxcrm vault set <key>` verschlüsselt; ohne Master-Key kein Klartext; GUI listet/setzt
  Einträge; Vault ist Teil des verschlüsselten F1-Backups.

### F7 · Transparente Token-Kosten **je Kunde** + Observability · 🔲 neu · M
- **Ziel:** Jeder LLM-Call wird mit Tokens + Kosten erfasst und **je Kunde** (und global) attribuiert —
  Grundlage für Outcome-/Consumption-Pricing (ResearchCRM-Trend) und Kostenkontrolle.
- **Vorhanden:** `computeAuditMetrics` (Ops/Tool/Actor/Automation-Rate), `callLlm` als zentraler LLM-Pfad.
- **Neu:** **Token-Ledger** `.agentic/usage.ndjson` (timestamp, slug, tool, model, inputTokens,
  outputTokens, costUsd) — geschrieben aus `callLlm`/`summarizeEmail` (Anthropic liefert `usage`);
  **Preis-Tabelle** je Modell konfigurierbar; `dxcrm usage [--slug] [--since]` + Aggregation in
  `dxcrm metrics`; MCP-Resource `crm://usage`. EU-AI-Act-Transparenz: Kennzeichnung KI-generierter Inhalte.
- **Akzeptanz:** Nach LLM-Calls zeigt `dxcrm usage --slug acme` Tokens + €/$ je Kunde; Summen stimmen.

### F8 · Hybrid-Search (Fundament für F4/F5) · 🟡→ausbauen · M
- **Ziel:** Robuste Trefferqualität durch **Vektor + Keyword (+ Reranking + Provenance)** statt nur Vektor.
- **Vorhanden:** LanceDB-Vektorsuche (`searchKnowledge`), Volltext-Fallback.
- **Neu:** `hybridSearch(query, corpus)` = LanceDB-Vektor-Score **+** BM25/Keyword-Score, gewichtet
  zusammengeführt + einfaches Reranking, mit Quellenangabe. Wiederverwendet für Memories (F4), SOPs (F5),
  KB und „Ask your CRM" (§2). Chunking 128–512 Tokens, nur Geändertes neu einbetten (Queue).
- **Akzeptanz:** Hybrid schlägt reinen Vektor bei exakten Begriffen/IDs; Ergebnisse enthalten `source`.

---

## 2. Wettbewerbs-Features aus ResearchCRM (höchster ROI, HITL-first)

| # | Feature | opencrm-Status | Nutzen / Umsetzung |
|---|---|---|---|
| C1 | **Call/Meeting → CRM-Autofill** (strukturierte Extraktion) | 🟡 (Transcript-Watcher, `summarize_meeting`) | #1-Schmerzpunkt (manuelle Eingabe). LLM-Function-Calling: Transcript → {Kontakt, Next Steps, Stage, Objections} → schreibt Felder/Deal (mit Approval F3) |
| C2 | **„Ask your CRM" (RAG-Chat / NL-Q&A)** | 🟡 (`search_customer_knowledge`) | NL-Fragen über strukturierte+unstrukturierte Daten via Hybrid-Search (F8) → MCP-Prompt + Resource |
| C3 | **Next-Best-Action-Engine** | 🟡 (Playbooks, deal-agent) | RAG über ähnliche gewonnene Deals + SOPs (F5) → empfohlener nächster Schritt |
| C4 | **Churn-Frühwarnung** | 🟡 (relationship-health, risk flags) | Engagement/Usage/Ticket-Signale → Score + Erklärbarkeit → Trigger + Retention-SOP |
| C5 | **Daten-Hygiene-Agent** | 🟡 (identity-dedup v1) | Fuzzy-Dedupe (Embeddings) + Format-/Lückenfix als **Vorschläge mit Approval** (F3) |
| C6 | **Enrichment-Layer** | 🔲 | Bei neuem Kontakt externe Quellen → fehlende Felder; pluginbar (vorhandenes Plugin-System) |
| C7 | **Conversation-Intelligence-Lite** | 🔲 | Talk-Listen-Ratio, Objection-Tracking, Coaching-Insights aus Transkripten |
| C8 | **Prädiktives Lead-Scoring (ML)** | 🟡 (heuristisch, `opportunity-score`) | Ab >500 Deals Gradient-Boosting auf Closed-Won/Lost; sonst Regeln. Output Score + Begründung |

**Bewusst vermeiden (ResearchCRM):** autonome **Cold-Outbound-SDR-Bots** als Kernfeature
(50–70 % Churn, Reputations-/Deliverability-Risiko). Inbound-Qualifizierung + Research/Daten-Layer sind
der verlässliche Pfad.

---

## 3. Compliance (Pflicht für EU-Verkauf)

- **EU AI Act Art. 50 (ab 2. Aug. 2026):** KI-Inhalte/Chat als AI kennzeichnen → Flag in generierten
  Drafts + maschinenlesbare Markierung. Use-Case-basierte Risikoklassifizierung dokumentieren.
- **DSGVO:** ✅ `gdpr erase` (Files + LanceDB + Löschprotokoll) vorhanden; DPIA/FRIA-Dokumentation ergänzen.
- **Datensouveränität als Verkaufsargument:** local-first + **lokale LLM-Option** (Ollama/vLLM) —
  `callLlm` provider-agnostisch machen (Anthropic | lokal).
- **Audit/Provenance:** ✅ Audit-Log + bi-temporaler Graph liefern die Nachvollziehbarkeit.

---

## 4. Schon vorhanden — **nicht neu bauen** (in Future-Feat integrieren)

Backup-Grundgerüst, AES-256-GCM, RBAC + Field-ACL, Audit-Log, GDPR-Erase, security-report, LanceDB +
Embeddings, bi-temporaler Graph, 56 MCP-Tools + Resources + Prompts, Token-Auth, PII-Masking, Guardrails,
Custom Objects/Fields, Webhooks, Segmente, Journey-Engine, Identity-Dedup, Routing, Eskalation,
Command-Center-Metriken, Multi-Connector-Import (inkl. vollständiger Salesforce-Migration).

---

## 5. Priorisierte Roadmap (mit Skalier-Triggern)

**P1 — Vertrauen & Pflicht-Fundament (0–3 Mon.):**
F8 Hybrid-Search → F4 Memories → F5 SOP-Modul → F3 HITL/Approval → F7 Token-Kosten/Observability.
*Trigger weiter:* Hybrid-Search-Trefferqualität verlässlich, Approval-Flow in Nutzung.

**P2 — Differenzierung & Sicherheit (3–6 Mon.):**
F2 Tonalität je Kunde → F1 Backup-all (verschlüsselt + Restore-Drill) → F6 Vault+GUI →
C1 Call→Autofill → C2 „Ask your CRM" → C5 Daten-Hygiene (mit Approval).

**P3 — Wettbewerbstiefe (6–12 Mon., mit Governance):**
C3 Next-Best-Action → C4 Churn-Frühwarnung → C8 ML-Lead-Scoring → C6 Enrichment → C7 Conversation-Intel →
Compliance-Härtung (Art. 50, lokale LLM-Option).

**Pricing-Hebel:** F7 (Token-Kosten je Kunde) ermöglicht **Outcome-/Consumption-Pricing** (HubSpot/
Intercom-Muster) — der Markt-Trend 2026.

---

## 6. Architektur-Hinweise (Wiederverwendung)

- **Hybrid-Search (F8)** ist das gemeinsame Fundament für Memories, SOPs, KB, „Ask your CRM".
- **`callLlm`** ist der einzige LLM-Choke-Point → dort F7 (Usage-Ledger), PII-Masking + Guardrails sitzen
  bereits hier; provider-agnostisch erweitern (lokale Modelle).
- **HITL-Gate (F3)** als dünner Wrapper vor schreibenden MCP-Tools (RBAC-ähnliches Enforcement).
- **Vault (F6)** nutzt `encryption.ts` + OS-Keychain; Vault-Key verschlüsselt auch F1-Backups.
- **Alles neue persistiert unter `.agentic/`** (Markdown/JSON) → automatisch von F1-Backup erfasst.
- **Alles agenten-nativ exponieren:** je Modul ein MCP-Tool/Resource + CLI (Doppel-Oberfläche).

---

## 7. Risiken & Caveats (aus ResearchCRM)

- **Hype vs. Realität:** >40 % agentic-Projekte abgebrochen; ROI-Zahlen der Vendor-Quellen sind Marketing.
  Fokus auf messbare HITL-Quick-Wins, nicht auf Vollautonomie.
- **Outcome-Pricing braucht präzise Metrik-Definition** (was zählt als „resolved"/Outcome).
- **Build-vs-Buy:** Standard-Workflows decken Vendor-Features ab; unser Eigenbau lohnt nur durch das
  spezifische **local-first + Markdown + MCP-native + Governance**-Modell — genau unser Moat.
- **Vault/Lizenzen:** Lizenz der gewählten npm (kdbxweb MIT / @napi-rs/keyring MIT) vor Auslieferung final
  verifizieren; KeePassXC ist GPL (separate App — Dateiformat-Nutzung unkritisch, kein Linking).
- **EU-AI-Act-Fristen im Fluss** (Digital Omnibus): vor verbindlicher Umsetzung Rechtsstand prüfen.
