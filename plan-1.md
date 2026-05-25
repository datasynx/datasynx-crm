# DatasynxOpenCRM — Phase 1 Technischer Implementierungsplan
**Version:** 1.0 · **Basis:** plan.md v4 + Deep-Search Recherche Mai 2026
**Ziel:** `npm install datasynx-opencrm` → Agent beantwortet "Was ist los mit Acme Corp?" in unter 3 Sekunden

---

## Kritische Korrekturen gegenüber plan.md (Recherche-Ergebnisse)

Diese Punkte aus plan.md sind veraltet oder falsch — hier gilt der korrigierte Stand:

| plan.md sagt | Recherche-Ergebnis | Konsequenz |
|---|---|---|
| `@xenova/transformers` | **Deprecated** — Nachfolger: `@huggingface/transformers` v3.8.1 | Package-Name ändern |
| `fastembed` als Alternative | **Archiviert Jan 2026** | Nicht verwenden |
| Gmail MCP via `@gongrzhe/server-gmail-autoauth-mcp` | **Archiviert März 2026** | Eigene Impl. mit `googleapis` |
| `tsup` als Build-Tool | **Nicht mehr maintained** | `tsdown` verwenden |
| `McpServer({ instructions: "..." })` | `instructions` ist **kein v1.x Konstruktor-Parameter** (nur v2-alpha) | Instructions in Tool-Descriptions |
| `server.tool()` für Tool-Registrierung | **In v2 entfernt** — bereits deprecated | `server.registerTool()` verwenden |
| `chalk` als Terminal-Library | **ESM-only** — nicht mit CJS kompatibel | `ansis` verwenden |
| `ora` als Spinner | **ESM-only** | `@topcli/spinner` (CJS+ESM) |
| `postinstall` für Framework-Detection | **pnpm v10 blockiert es**, npm-Audits flaggen | Lazy Detection beim ersten `dxcrm init` |
| `~/.claude/claude_desktop_config.json` | Falscher Pfad — korrekt: **`~/.claude.json`** | Config-Schreiblogik anpassen |

---

## Stack — Final (nach Recherche)

```
Language:    TypeScript 5.8+ (strict, ESM-only "type": "module")
Build:       tsdown (Rolldown-basiert, tsup-Nachfolger)
Runtime:     Node.js ≥ 20
Test:        Vitest (ESM-nativ, kein Config-Overhead)
CLI:         Commander v14
MCP:         @modelcontextprotocol/sdk v1.x (server.registerTool())
Vector DB:   @lancedb/lancedb v0.29+ (embedded, kein Server)
Embeddings:  @huggingface/transformers v3.8.1 (ONNX/WASM lokal)
Gmail:       googleapis (direkt, kein MCP-Wrapper)
Watcher:     chokidar v4 (kein Glob, ignored als Function)
Cron:        cron (kelektiv) v4.4+ (waitForCompletion: true)
Validation:  zod v3 + zod-validation-error
Frontmatter: gray-matter v4
Terminal:    ansis (chalk-Drop-In, CJS+ESM)
Table:       cli-table3
```

---

## Projektstruktur (kanonisch)

```
datasynx-opencrm/
├── src/
│   ├── cli.ts                    # Commander Entry Point (bin: dxcrm)
│   ├── index.ts                  # Library Entry Point
│   │
│   ├── commands/                 # CLI Commands (eine Datei pro Command)
│   │   ├── init.ts               # dxcrm init
│   │   ├── create.ts             # dxcrm create
│   │   ├── list.ts               # dxcrm list
│   │   ├── sync.ts               # dxcrm sync
│   │   ├── session.ts            # dxcrm session open/close/status
│   │   ├── guide.ts              # dxcrm guide
│   │   ├── backup.ts             # dxcrm backup/restore
│   │   ├── validate.ts           # dxcrm validate
│   │   └── daemon.ts             # dxcrm daemon start/stop/status
│   │
│   ├── mcp/
│   │   ├── server.ts             # McpServer Setup + Transport-Wahl
│   │   ├── tools/                # Ein File pro MCP-Tool
│   │   │   ├── get-capabilities.ts
│   │   │   ├── get-active-session.ts
│   │   │   ├── get-customer-context.ts
│   │   │   ├── search-customer-knowledge.ts
│   │   │   ├── list-customers.ts
│   │   │   ├── log-interaction.ts
│   │   │   ├── update-deal.ts
│   │   │   └── export-customer.ts
│   │   └── capabilities.ts       # get_capabilities() Text (Single Source of Truth)
│   │
│   ├── core/
│   │   ├── context-builder.ts    # buildContext(slug) → ContextBlock
│   │   ├── embedder.ts           # Singleton Embedding Pipeline
│   │   ├── lancedb.ts            # DB-Verbindung + Table-Management
│   │   └── session-store.ts      # Aktive Sessions (in-memory + .agentic/config.json)
│   │
│   ├── sync/
│   │   ├── gmail-sync.ts         # Gmail API → interactions.md + LanceDB
│   │   ├── calendar-sync.ts      # Google Calendar → interactions.md
│   │   └── transcript-watcher.ts # chokidar + Verarbeitungs-Pipeline
│   │
│   ├── daemon/
│   │   └── worker.ts             # Detached Daemon Process (cron + watcher)
│   │
│   ├── setup/
│   │   ├── framework-detector.ts # Erkennt Claude Code, Codex, Cursor, Continue
│   │   └── framework-writer.ts   # Schreibt MCP-Config in alle Frameworks
│   │
│   ├── schemas/
│   │   ├── main-facts.ts         # Zod-Schema main_facts.md Frontmatter
│   │   ├── interaction.ts        # Zod-Schema Interaction-Eintrag
│   │   ├── pipeline.ts           # Zod-Schema pipeline.md Deal
│   │   └── sources.ts            # Zod-Schema sources.json
│   │
│   ├── fs/
│   │   ├── customer-dir.ts       # Lesen/Schreiben Kundenverzeichnis
│   │   ├── interactions-writer.ts # interactions.md append/prepend
│   │   └── pipeline-writer.ts    # pipeline.md update
│   │
│   └── ui/
│       ├── colors.ts             # ansis Farb-Helfer (success/error/warning)
│       └── table.ts              # cli-table3 Render-Funktionen
│
├── __tests__/                    # Vitest Tests (spiegelt src/)
│   ├── commands/
│   ├── mcp/tools/
│   ├── core/
│   ├── sync/
│   ├── schemas/
│   └── fs/
│
├── docs/                         # Offizielle Dokumentation
│   ├── cli-reference.md
│   ├── mcp-tools.md
│   ├── schemas.md
│   ├── integrations.md
│   └── deployment.md
│
├── scripts/
│   └── postbuild.ts              # chmod +x dist/cli.js, etc.
│
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
├── package.json
├── README.md
└── CLAUDE.md
```

---

## package.json (vollständig)

```json
{
  "name": "datasynx-opencrm",
  "version": "1.0.0",
  "description": "Local-first, MCP-native CRM. One agent per customer. npm install.",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./mcp": {
      "import": { "types": "./dist/mcp.d.ts", "default": "./dist/mcp.js" },
      "require": { "types": "./dist/mcp.d.cts", "default": "./dist/mcp.cjs" }
    }
  },
  "bin": {
    "dxcrm": "./dist/cli.js",
    "datasynx-opencrm": "./dist/cli.js"
  },
  "files": ["dist/", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsdown && node scripts/postbuild.js",
    "dev": "tsx watch src/cli.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "npm run typecheck && npm test && npm run build",
    "mcp:start": "node dist/mcp.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.0",
    "@lancedb/lancedb": "^0.29.0",
    "@huggingface/transformers": "^3.8.1",
    "googleapis": "^140.0.0",
    "commander": "^14.0.0",
    "gray-matter": "^4.0.3",
    "zod": "^3.25.0",
    "zod-validation-error": "^3.0.0",
    "chokidar": "^4.0.0",
    "cron": "^4.4.0",
    "ansis": "^3.0.0",
    "cli-table3": "^0.6.3",
    "@topcli/spinner": "^2.0.0",
    "which": "^4.0.0"
  },
  "peerDependencies": {
    "express": "^4.0.0 || ^5.0.0"
  },
  "peerDependenciesMeta": {
    "express": { "optional": true }
  },
  "devDependencies": {
    "tsdown": "^0.12.0",
    "typescript": "^5.8.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "memfs": "^4.0.0",
    "@types/cli-table3": "^0.6.0",
    "@types/which": "^3.0.0"
  }
}
```

---

## tsdown.config.ts

```typescript
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    mcp: "src/mcp/server.ts",
    "daemon/worker": "src/daemon/worker.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "@lancedb/lancedb",
    "@huggingface/transformers",
    "googleapis",
  ],
  banner: {
    js: (ctx) => ctx.output.fileName.startsWith("cli") ? "#!/usr/bin/env node" : "",
  },
});
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

---

## vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/daemon/worker.ts"],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    // Kritischer Pfad (Links 1-8): 100% Coverage erzwingen
    setupFiles: ["__tests__/setup.ts"],
  },
});
```

---

## TDD-Strategie — Test-First Reihenfolge

Jeder Link beginnt mit einem failing Test. Die Reihenfolge entspricht dem kritischen Pfad.

### Test-Kategorien

```
Unit Tests       → Pure Funktionen, kein IO (schemas, context-builder, embedder-singleton)
Integration Tests → Mit Dateisystem (memfs Mock), kein Netzwerk
E2E Tests        → Mit echtem Dateisystem, gegen echten MCP-Server (nur CI)
```

### Mocking-Strategie

```typescript
// __tests__/setup.ts
import { vi } from "vitest";

// Dateisystem: memfs für alle FS-Operationen
vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return fs;
});
vi.mock("fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});

// LanceDB: leichte Fake-Implementierung
vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn().mockResolvedValue({
    openTable: vi.fn(),
    createEmptyTable: vi.fn(),
    tableNames: vi.fn().mockResolvedValue([]),
  }),
}));

// Transformers: gibt immer 384-dim Float32Array zurück
vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue({ data: new Float32Array(384).fill(0.1) })
  ),
  env: { cacheDir: "" },
}));

// googleapis: gemockt per Test-Suite
vi.mock("googleapis");
```

---

## Link 1 — `dxcrm init`

### Was es tut

```
1. Framework Detection (which + Dateisystem-Checks)
2. Schreibt MCP-Config in alle erkannten Frameworks
3. Erstellt .agentic/ Verzeichnis + sources.json + config.json + schema.json
4. Startet Daemon (detached)
5. Ausgabe: Zusammenfassung was gefunden/konfiguriert wurde
```

### Framework Detection — exakte Config-Pfade

```typescript
// src/setup/framework-detector.ts
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export interface DetectedFrameworks {
  claudeCode: boolean;
  codex: boolean;
  cursor: boolean;
  continueDev: boolean;
}

export function detectFrameworks(): DetectedFrameworks {
  const home = os.homedir();

  const hasCmd = (cmd: string): boolean => {
    try { execSync(`which ${cmd}`, { stdio: "ignore" }); return true; }
    catch { return false; }
  };
  const hasDir = (p: string): boolean => {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
  };
  const hasFile = (p: string): boolean => fs.existsSync(p);

  return {
    // Claude Code: binary ODER ~/.claude.json ODER ~/.claude/ Verzeichnis
    claudeCode:
      hasCmd("claude") ||
      hasFile(path.join(home, ".claude.json")) ||
      hasDir(path.join(home, ".claude")),

    // Codex CLI
    codex:
      hasCmd("codex") ||
      hasDir(path.join(home, ".codex")),

    // Cursor: kein CLI-Binary → nur Dateisystem
    cursor:
      hasDir(path.join(home, ".cursor")) ||
      hasFile(path.join(home, ".cursor", "mcp.json")),

    // Continue.dev
    continueDev:
      hasDir(path.join(home, ".continue")) ||
      hasFile(path.join(home, ".continue", "config.yaml")),
  };
}
```

### MCP-Config schreiben — alle Formate

```typescript
// src/setup/framework-writer.ts

const MCP_ENTRY = {
  type: "stdio",
  command: process.execPath,       // absoluter Node-Pfad, kein npx
  args: ["/path/to/dist/mcp.js"], // wird zur Laufzeit aufgelöst
};

// ─── Claude Code: ~/.claude.json ─────────────────────────────────────────────
export function writeClaudeCode(mcpJsPath: string): void {
  const configPath = path.join(os.homedir(), ".claude.json");
  let json: Record<string, any> = {};
  if (fs.existsSync(configPath)) {
    try { json = JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch {}
  }
  // User-Scope: top-level mcpServers (global für alle Projekte)
  json.mcpServers ??= {};
  json.mcpServers["datasynx-opencrm"] = {
    type: "stdio",
    command: process.execPath,
    args: [mcpJsPath],
  };
  fs.writeFileSync(configPath, JSON.stringify(json, null, 2));
}

// ─── Codex: ~/.codex/config.toml ─────────────────────────────────────────────
// KEIN vollständiger TOML-Parser nötig — wir appenden nur
export function writeCodex(mcpJsPath: string): void {
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  const section = `\n[mcp_servers.datasynx-opencrm]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(mcpJsPath)}]\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\nenabled = true\n`;

  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : "";
  if (existing.includes("[mcp_servers.datasynx-opencrm]")) return; // Idempotent
  fs.appendFileSync(configPath, section);
}

// ─── Cursor: ~/.cursor/mcp.json ──────────────────────────────────────────────
export function writeCursor(mcpJsPath: string): void {
  const configPath = path.join(os.homedir(), ".cursor", "mcp.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  let json: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    try { json = JSON.parse(fs.readFileSync(configPath, "utf-8")); json.mcpServers ??= {}; } catch {}
  }
  json.mcpServers!["datasynx-opencrm"] = { command: process.execPath, args: [mcpJsPath] };
  fs.writeFileSync(configPath, JSON.stringify(json, null, 2));
}

// ─── Continue.dev: ~/.continue/config.yaml ───────────────────────────────────
// Minimal: standalone MCP-File (wird von Continue automatisch gelesen)
export function writeContinueDev(mcpJsPath: string): void {
  const dir = path.join(os.homedir(), ".continue", "mcpServers");
  fs.mkdirSync(dir, { recursive: true });
  const content = `name: datasynx-opencrm\ncommand: ${process.execPath}\nargs:\n  - ${mcpJsPath}\n`;
  fs.writeFileSync(path.join(dir, "datasynx-opencrm.yaml"), content);
}
```

### Tests für Link 1

```typescript
// __tests__/setup/framework-detector.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { detectFrameworks } from "../../src/setup/framework-detector.js";

describe("detectFrameworks", () => {
  it("detects Claude Code via ~/.claude.json", () => {
    // memfs hat .claude.json
    vol.fromJSON({ [`${HOME}/.claude.json`]: "{}" });
    expect(detectFrameworks().claudeCode).toBe(true);
  });

  it("detects Codex via ~/.codex/ directory", () => {
    vol.fromJSON({ [`${HOME}/.codex/config.toml`]: "" });
    expect(detectFrameworks().codex).toBe(true);
  });

  it("returns false when nothing is installed", () => {
    vol.fromJSON({});
    const result = detectFrameworks();
    expect(result.claudeCode).toBe(false);
    expect(result.codex).toBe(false);
    expect(result.cursor).toBe(false);
    expect(result.continueDev).toBe(false);
  });
});

// __tests__/setup/framework-writer.test.ts
describe("writeClaudeCode", () => {
  it("creates ~/.claude.json when it doesn't exist", () => { ... });
  it("deep-merges into existing ~/.claude.json without overwriting other entries", () => { ... });
  it("is idempotent — calling twice produces same result", () => { ... });
});
```

---

## Link 2 — Source Discovery + sources.json

### `.agentic/sources.json` Schema (Zod)

```typescript
// src/schemas/sources.ts
import { z } from "zod";

export const GmailSourceSchema = z.object({
  type: z.literal("gmail"),
  query: z.string(),      // z.B. "from:acme.com OR to:acme.com"
  enabled: z.boolean().default(true),
});

export const TranscriptSourceSchema = z.object({
  type: z.literal("transcript"),
  paths: z.array(z.string()),  // abs. Pfade zu Watch-Verzeichnissen
  extensions: z.array(z.string()).default([".txt", ".vtt"]),
  enabled: z.boolean().default(true),
});

export const GlobalSourcesSchema = z.object({
  gmail: GmailSourceSchema.optional(),
  calendar: z.object({ enabled: z.boolean().default(true) }).optional(),
  transcripts: TranscriptSourceSchema.optional(),
  version: z.number().default(1),
  created: z.string(),         // ISO timestamp
});

export type GlobalSources = z.infer<typeof GlobalSourcesSchema>;
```

### Discovery-Logik

```typescript
// src/commands/init.ts — Source Discovery
async function discoverSources(): Promise<GlobalSources> {
  const home = os.homedir();
  const transcriptPaths: string[] = [];

  // Bekannte Transcript-Pfade prüfen
  const candidates = [
    path.join(home, "Downloads", "Fireflies"),
    path.join(home, "Downloads", "Otter"),
    path.join(home, "Documents", "Zoom"),
    path.join(home, "Downloads", "Zoom"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) transcriptPaths.push(p);
  }

  return {
    gmail: { type: "gmail", query: "", enabled: true },  // Query per Kunde in customers/*/sources.json
    transcripts: transcriptPaths.length > 0
      ? { type: "transcript", paths: transcriptPaths, extensions: [".txt", ".vtt"], enabled: true }
      : undefined,
    version: 1,
    created: new Date().toISOString(),
  };
}
```

---

## Link 3 — Customer Creation

### `dxcrm create "Acme Corp" --domain acme.com --email max@acme.com`

```typescript
// src/commands/create.ts
import slugify from "slug";   // slug package für konsistente IDs

export async function createCustomer(opts: {
  name: string;
  domain?: string;
  email?: string;
}): Promise<void> {
  const id = slugify(opts.name, { lower: true });
  const dir = path.join(process.cwd(), "customers", id);

  if (fs.existsSync(dir)) throw new Error(`Customer '${id}' already exists.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "artifacts"));

  // 1. main_facts.md
  fs.writeFileSync(path.join(dir, "main_facts.md"), buildMainFacts(id, opts));

  // 2. interactions.md
  fs.writeFileSync(path.join(dir, "interactions.md"),
    `# Interactions — ${opts.name}\n\n<!-- Newest entries first -->\n`);

  // 3. pipeline.md
  fs.writeFileSync(path.join(dir, "pipeline.md"),
    `# Pipeline — ${opts.name}\n\n<!-- Deals listed here -->\n`);

  // 4. sources.json (per-Customer, mit Gmail-Query vorverdrahtet)
  const sources = {
    gmail: {
      query: buildGmailQuery(opts.domain, opts.email),
      enabled: true,
    },
    version: 1,
  };
  fs.writeFileSync(path.join(dir, "sources.json"), JSON.stringify(sources, null, 2));

  // 5. LanceDB-Collection initialisieren (leere Table)
  await initCustomerTable(id);
}

function buildGmailQuery(domain?: string, email?: string): string {
  const parts: string[] = [];
  if (domain) parts.push(`from:${domain} OR to:${domain}`);
  if (email) parts.push(`from:${email} OR to:${email}`);
  return parts.join(" OR ");
}
```

### `main_facts.md` Template

```typescript
function buildMainFacts(id: string, opts: { name: string; domain?: string; email?: string }): string {
  const today = new Date().toISOString().split("T")[0];
  return `---
id: ${id}
status: active
owner: me
created: ${today}
last_touchpoint: ${today}
tags: []
---

# Customer: ${opts.name}

## Quick Reference
- **Type:** — · **Industry:** — · **Size:** — · **Website:** ${opts.domain ? `https://${opts.domain}` : "—"}

## Contacts
| Name | Role | Email | Channel |
|---|---|---|---|
| — | — | ${opts.email ?? "—"} | — |

## Summary
[2 Sätze: was sie tun, warum sie Kunde sind.]

## Critical Context
- [Wichtigste Besonderheiten]

## Open Questions
- [Dinge, die beim nächsten Kontakt geklärt werden müssen]
`;
}
```

### Schema-Validierung (Zod)

```typescript
// src/schemas/main-facts.ts
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import matter from "gray-matter";

export const MainFactsSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["active", "inactive", "churned"]),
  owner: z.string().min(1),
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  last_touchpoint: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  tags: z.array(z.string()).default([]),
});

export type MainFacts = z.infer<typeof MainFactsSchema>;

export function parseMainFacts(filePath: string): MainFacts {
  const raw = matter.read(filePath);
  const result = MainFactsSchema.safeParse(raw.data);
  if (!result.success) {
    throw new Error(fromZodError(result.error, {
      prefix: `Schema error in ${filePath}`,
      prefixSeparator: ":\n  - ",
      issueSeparator: "\n  - ",
    }).message);
  }
  return result.data;
}
```

### Tests für Link 3

```typescript
// __tests__/commands/create.test.ts
describe("createCustomer", () => {
  it("creates 4 files in customers/<slug>/", async () => { ... });
  it("completes in under 3 seconds", async () => { ... });
  it("main_facts.md frontmatter passes Zod validation", async () => { ... });
  it("sources.json has gmail query with domain filter", async () => { ... });
  it("throws if customer already exists", async () => { ... });
});

describe("parseMainFacts", () => {
  it("parses valid frontmatter", () => { ... });
  it("throws user-friendly error for missing required fields", () => { ... });
  it("throws user-friendly error for invalid status enum", () => { ... });
  it("throws user-friendly error for wrong date format", () => { ... });
});
```

---

## Link 4 — Gmail Sync Engine

### OAuth2 Flow (CLI-friendly)

```typescript
// src/sync/gmail-auth.ts
import { google, Auth } from "googleapis";
import fs from "fs";
import path from "path";
import os from "os";

const TOKEN_PATH = path.join(os.homedir(), ".config", "datasynx-opencrm", "gmail-token.json");
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export async function getGmailClient(): Promise<Auth.OAuth2Client> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set.\nRun: dxcrm setup gmail");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob");

  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    oauth2.setCredentials(tokens);

    // Auto-Refresh wenn Token abgelaufen
    oauth2.on("tokens", (newTokens) => {
      const merged = { ...tokens, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });

    return oauth2;
  }

  // Erster Auth-Flow
  const authUrl = oauth2.generateAuthUrl({ scope: SCOPES, access_type: "offline" });
  console.log("\nGmail Authorization needed.");
  console.log("Open this URL in your browser:\n");
  console.log(authUrl);
  console.log("\nPaste the code here:");

  const code = await readStdin();
  const { tokens } = await oauth2.getToken(code.trim());
  oauth2.setCredentials(tokens);
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return oauth2;
}
```

### Sync-Engine (Idempotenz via source_ref)

```typescript
// src/sync/gmail-sync.ts
import { google } from "googleapis";
import type { Auth } from "googleapis";

interface SyncOptions {
  customerId: string;           // slug, z.B. "acme-corp"
  gmailQuery: string;           // "from:acme.com OR to:acme.com"
  daysBack?: number;            // Default: 90
  maxResults?: number;          // Default: 100 (Rate-Limit-Schutz)
  dryRun?: boolean;
}

export async function syncGmail(auth: Auth.OAuth2Client, opts: SyncOptions): Promise<number> {
  const gmail = google.gmail({ version: "v1", auth });
  const after = new Date();
  after.setDate(after.getDate() - (opts.daysBack ?? 90));
  const dateFilter = `after:${after.toISOString().split("T")[0].replace(/-/g, "/")}`;
  const query = `${opts.gmailQuery} ${dateFilter}`;

  let pageToken: string | undefined;
  let newEntries = 0;

  do {
    // Rate-Limit-safe: max 50 threads pro Batch
    const res = await gmail.users.threads.list({
      userId: "me",
      q: query,
      maxResults: Math.min(opts.maxResults ?? 100, 50),
      pageToken,
    });

    const threads = res.data.threads ?? [];
    for (const thread of threads) {
      const sourceRef = `gmail://thread/${thread.id}`;

      // Idempotenz: prüfen ob schon in LanceDB
      const exists = await checkSourceRefExists(opts.customerId, sourceRef);
      if (exists) continue;

      // Thread-Details laden
      const detail = await gmail.users.threads.get({ userId: "me", id: thread.id! });
      const entry = await extractInteractionFromThread(detail.data, sourceRef);

      if (!opts.dryRun) {
        await appendInteraction(opts.customerId, entry);
        await indexInLanceDB(opts.customerId, entry, sourceRef);
        newEntries++;
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;

    // Exponential Backoff bei Rate-Limit-Errors (429)
    await sleep(200); // 200ms zwischen Batches → safe bei ~5 req/s
  } while (pageToken);

  return newEntries;
}
```

### LLM-Extraktion → interactions.md Entry

```typescript
async function extractInteractionFromThread(
  thread: gmail_v1.Schema$Thread,
  sourceRef: string
): Promise<InteractionEntry> {
  const messages = thread.messages ?? [];
  const firstMsg = messages[0];
  const subject = getHeader(firstMsg, "Subject") ?? "(no subject)";
  const from = getHeader(firstMsg, "From") ?? "unknown";
  const date = new Date(parseInt(firstMsg.internalDate ?? "0")).toISOString().split("T")[0];
  const bodyText = extractPlainText(messages);

  // LLM-Extraktion für Summary + Next Steps
  // Hinweis: In Phase 1 wird kein externer LLM-Call gemacht —
  // die Zusammenfassung wird durch einfache Heuristiken erstellt.
  // Phase 2 fügt LLM-Summarization hinzu.
  const summary = `Email thread with ${messages.length} message(s). Subject: ${subject}`;

  return {
    date,
    type: "Email",
    direction: from.includes("me") ? "Outbound" : "Inbound",
    with: from,
    subject,
    summary,
    nextSteps: [],
    sourceRef,
    synced: new Date().toISOString(),
  };
}
```

### Tests für Link 4

```typescript
// __tests__/sync/gmail-sync.test.ts
describe("syncGmail", () => {
  it("creates one interaction entry per unique thread", async () => { ... });
  it("does not create duplicate entries on second sync (idempotent)", async () => { ... });
  it("respects maxResults limit", async () => { ... });
  it("dryRun does not write to disk", async () => { ... });
  it("handles Gmail 429 rate limit with backoff", async () => { ... });
});
```

---

## Link 5 — Transcript Watcher

```typescript
// src/sync/transcript-watcher.ts
import chokidar from "chokidar";
import path from "path";
import fs from "fs";

export function startTranscriptWatcher(
  watchPaths: string[],
  customerId: string,
  onProcessed: (filePath: string, entry: InteractionEntry) => void,
  onUnmatched: (filePath: string) => void,
): chokidar.FSWatcher {
  // chokidar v4: KEIN Glob — Ordner direkt, Filter via ignored Function
  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,     // Keine Events für bestehende Dateien beim Start
    awaitWriteFinish: {
      stabilityThreshold: 2000, // Datei muss 2s unverändert sein
      pollInterval: 100,
    },
    ignored: (filePath: string, stats?: fs.Stats) => {
      if (stats?.isDirectory()) return false;
      if (!stats) return false;
      const ext = path.extname(filePath).toLowerCase();
      return ext !== ".txt" && ext !== ".vtt";
    },
    followSymlinks: false,
    usePolling: false,
  });

  watcher.on("add", async (filePath) => {
    try {
      const text = fs.readFileSync(filePath, "utf-8");
      const entry = await processTranscript(filePath, text, customerId);

      if (entry) {
        await appendInteraction(customerId, entry);
        await indexInLanceDB(customerId, entry, `file://${filePath}`);
        onProcessed(filePath, entry);
      } else {
        // Nicht zuordnenbar → unmatched-transcripts.json
        appendUnmatched(filePath);
        onUnmatched(filePath);
      }
    } catch (err) {
      console.error(`Transcript error: ${filePath}:`, (err as Error).message);
    }
  });

  return watcher;
}

// Unmatched-Transcripts protokollieren (nie still scheitern)
function appendUnmatched(filePath: string): void {
  const unmatchedPath = path.join(process.cwd(), ".agentic", "unmatched-transcripts.json");
  let list: Array<{ path: string; timestamp: string }> = [];
  if (fs.existsSync(unmatchedPath)) {
    try { list = JSON.parse(fs.readFileSync(unmatchedPath, "utf-8")); } catch {}
  }
  list.push({ path: filePath, timestamp: new Date().toISOString() });
  fs.writeFileSync(unmatchedPath, JSON.stringify(list, null, 2));
}
```

---

## Link 6 — Context Builder

### Deterministisch, <3000 Token, byte-identisch

```typescript
// src/core/context-builder.ts

export interface ContextBlock {
  slug: string;
  generatedAt: string;        // ISO timestamp
  tokenEstimate: number;
  sections: {
    quickReference: string;
    contacts: string;
    criticalContext: string;
    recentActivity: string;   // letzte 5 Interaktionen
    openDeals: string;
    openQuestions: string;
  };
  raw: string;                // Vollständiger Markdown-Block
}

const MAX_INTERACTIONS = 5;   // Nur letzte N Interaktionen
const MAX_TOKENS = 3000;      // Hard-Cap

export async function buildContext(slug: string): Promise<ContextBlock> {
  const customerDir = path.join(process.cwd(), "customers", slug);
  if (!fs.existsSync(customerDir)) {
    throw new Error(`Customer '${slug}' not found.`);
  }

  // 1. main_facts.md lesen (gibt Fehler wenn Schema invalide)
  const mainFacts = parseMainFacts(path.join(customerDir, "main_facts.md"));
  const mainContent = matter.read(path.join(customerDir, "main_facts.md")).content;

  // 2. Letzte N Interaktionen aus interactions.md extrahieren
  const interactions = parseRecentInteractions(
    path.join(customerDir, "interactions.md"),
    MAX_INTERACTIONS
  );

  // 3. Offene Deals aus pipeline.md
  const openDeals = parseOpenDeals(path.join(customerDir, "pipeline.md"));

  // 4. Deterministischer Aufbau — feste Section-Reihenfolge (Agenten verlassen sich darauf)
  const sections = {
    quickReference: extractSection(mainContent, "Quick Reference"),
    contacts: extractSection(mainContent, "Contacts"),
    criticalContext: extractSection(mainContent, "Critical Context"),
    recentActivity: formatInteractions(interactions),
    openDeals: formatDeals(openDeals),
    openQuestions: extractSection(mainContent, "Open Questions"),
  };

  const raw = buildRawBlock(slug, mainFacts, sections);
  const tokenEstimate = estimateTokens(raw);

  if (tokenEstimate > MAX_TOKENS) {
    // Trim älteste Interaktionen bis unter Limit
    return buildContext_trimmed(slug, mainFacts, sections, MAX_TOKENS);
  }

  return {
    slug,
    generatedAt: new Date().toISOString(),
    tokenEstimate,
    sections,
    raw,
  };
}

// Token-Schätzung: 1 Token ≈ 4 Zeichen (Heuristik, kein LLM-Call)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### Tests für Link 6

```typescript
// __tests__/core/context-builder.test.ts
describe("buildContext", () => {
  it("is deterministic — calling twice returns byte-identical output", async () => {
    const a = await buildContext("acme-corp");
    const b = await buildContext("acme-corp");
    expect(a.raw).toBe(b.raw);
  });

  it("completes in under 2 seconds", async () => {
    const start = Date.now();
    await buildContext("acme-corp");
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("stays under 3000 tokens for customer with 50 interactions", async () => {
    // Setup: 50 Interaktionen in memfs
    const result = await buildContext("heavy-customer");
    expect(result.tokenEstimate).toBeLessThan(3000);
  });

  it("throws if customer doesn't exist", async () => {
    await expect(buildContext("nonexistent")).rejects.toThrow("not found");
  });

  it("sections are in fixed order", async () => {
    const result = await buildContext("acme-corp");
    const keys = Object.keys(result.sections);
    expect(keys).toEqual([
      "quickReference", "contacts", "criticalContext",
      "recentActivity", "openDeals", "openQuestions"
    ]);
  });
});
```

---

## Link 7 — MCP Server

### Korrekte v1.x Implementierung

```typescript
// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// WICHTIG: console.log schreibt auf stdout = MCP-Protokoll kaputt!
// Immer console.error() für Debug-Output in stdio-Mode verwenden.

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "datasynx-opencrm",
    version: "1.0.0",
  });

  // Tools registrieren — server.registerTool() (nicht server.tool() — deprecated in v2)
  registerGetCapabilities(server);
  registerGetActiveSession(server);
  registerGetCustomerContext(server);
  registerSearchCustomerKnowledge(server);
  registerListCustomers(server);
  registerLogInteraction(server);
  registerUpdateDeal(server);
  registerExportCustomer(server);

  return server;
}

export async function startStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DatasynxOpenCRM MCP Server running via stdio");
}

export async function startHttp(port = 3847): Promise<void> {
  const { default: express } = await import("express");
  const app = express();
  app.use(express.json());

  const server = createMcpServer();

  // Stateless: neue Transport-Instanz pro Request
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.listen(port, () => {
    console.error(`DatasynxOpenCRM MCP Server running on http://0.0.0.0:${port}/mcp`);
  });
}
```

### Tool-Registrierung — Beispiel `get_customer_context`

```typescript
// src/mcp/tools/get-customer-context.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerGetCustomerContext(server: McpServer): void {
  server.registerTool(
    "get_customer_context",
    {
      title: "Get Customer Context",
      description: `Returns a complete, LLM-ready context block for a customer.
Triggers on-query Gmail sync automatically before returning.
Use this before any customer-related conversation or action.

Args:
  slug (optional): Customer ID (e.g. "acme-corp"). If omitted, uses active session.

Returns: Structured markdown with Quick Reference, Contacts, Critical Context,
Recent Activity (last 5), Open Deals, and Open Questions.

Performance: <3 seconds including sync. Token budget: <3000.`,
      inputSchema: z.object({
        slug: z.string().optional().describe(
          "Customer slug (e.g. 'acme-corp'). Leave empty for active session customer."
        ),
      }),
      annotations: {
        readOnlyHint: false,   // triggert sync (write to lancedb)
        idempotentHint: true,
      },
    },
    async ({ slug }) => {
      try {
        const targetSlug = slug ?? getActiveSessionCustomer();
        if (!targetSlug) {
          return {
            content: [{
              type: "text" as const,
              text: "No customer specified and no active session. Use: get_customer_context({ slug: 'acme-corp' })",
            }],
            isError: true,
          };
        }

        // On-Query Sync (Gmail, async, non-blocking if fails)
        await syncGmailForCustomer(targetSlug).catch((err) => {
          console.error(`Sync warning for ${targetSlug}:`, err.message);
        });

        const context = await buildContext(targetSlug);

        return {
          content: [{ type: "text" as const, text: context.raw }],
          structuredContent: context,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

### `get_capabilities()` — Single Source of Truth

```typescript
// src/mcp/capabilities.ts
// Diese Datei ist die EINZIGE Quelle für Capability-Dokumentation.
// Wird von get_capabilities() MCP-Tool UND dxcrm guide CLI verwendet.

export const CAPABILITIES_TEXT = `
# DatasynxOpenCRM — Agent Guide

## Available Tools

### get_customer_context(slug?)
Load complete briefing for a customer. Syncs Gmail automatically.
Usage: Before any customer conversation. Works without slug if session is active.

### search_customer_knowledge(slug, query)
Hybrid vector+FTS search across all emails and transcripts for a customer.
Usage: "What did Acme say about pricing?" / "Find GDPR mentions"

### list_customers(status?, owner?)
List all customers with last touchpoint and deal health.
Usage: Morning briefing / Pipeline overview

### log_interaction(slug, type, summary, nextSteps?)
Write a new interaction entry. Immediately searchable.
Usage: After every call/meeting/email. Agent calls this, not the user.

### update_deal(slug, dealName, fields)
Update deal stage, value, probability, or close date.
Usage: After pipeline discussions.

### get_active_session()
Check which customer is currently active.

### export_customer(slug)
Export all customer data as a ZIP file.

## Workflow
1. User mentions a customer → get_customer_context()
2. Ask/answer questions → search_customer_knowledge() if needed
3. After interaction → log_interaction()
4. After deal update → update_deal()

## Response Format
Always cite sources (gmail://thread/... or file://...) when available.
`.trim();
```

### Claude Code `alwaysAllow` — `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "mcp__datasynx-opencrm__get_capabilities",
      "mcp__datasynx-opencrm__get_active_session",
      "mcp__datasynx-opencrm__get_customer_context",
      "mcp__datasynx-opencrm__search_customer_knowledge",
      "mcp__datasynx-opencrm__list_customers",
      "mcp__datasynx-opencrm__log_interaction",
      "mcp__datasynx-opencrm__update_deal",
      "mcp__datasynx-opencrm__export_customer"
    ]
  }
}
```

---

## Link 8 — Write-Back: `log_interaction()`

```typescript
// src/mcp/tools/log-interaction.ts
server.registerTool(
  "log_interaction",
  {
    title: "Log Interaction",
    description: `Write a new interaction entry to the CRM. Use after every call, meeting, or email.
Format matches auto-synced entries exactly — no special treatment needed.

Args:
  slug: Customer ID
  type: "Call" | "Meeting" | "Email" | "Note" | "Demo" | "Proposal"
  with: Who was involved
  summary: 2-5 sentences describing what happened
  nextSteps: Array of action items (optional)
  date: YYYY-MM-DD (optional, defaults to today)`,
    inputSchema: z.object({
      slug: z.string(),
      type: z.enum(["Call", "Meeting", "Email", "Note", "Demo", "Proposal"]),
      with: z.string(),
      summary: z.string().min(10).max(1000),
      nextSteps: z.array(z.string()).optional().default([]),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  },
  async ({ slug, type, with: withStr, summary, nextSteps, date }) => {
    const entry: InteractionEntry = {
      date: date ?? new Date().toISOString().split("T")[0],
      type,
      with: withStr,
      summary,
      nextSteps: nextSteps ?? [],
      sourceRef: `agent://log/${Date.now()}`,
      synced: new Date().toISOString(),
    };

    // 1. interactions.md (prepend — neueste zuerst)
    await prependInteraction(slug, entry);

    // 2. last_touchpoint in main_facts.md updaten
    await updateLastTouchpoint(slug, entry.date);

    // 3. LanceDB indexieren (sofort durchsuchbar)
    await indexInLanceDB(slug, entry, entry.sourceRef);

    return {
      content: [{
        type: "text" as const,
        text: `Interaction logged for ${slug} on ${entry.date}. Immediately searchable.`,
      }],
    };
  }
);
```

### `interactions.md` Schreibfunktion (exaktes Format)

```typescript
// src/fs/interactions-writer.ts

const INTERACTION_SEPARATOR = "---";

export function formatInteractionEntry(entry: InteractionEntry): string {
  const nextStepsBlock = entry.nextSteps.length > 0
    ? entry.nextSteps.map(s => `- [ ] ${s}`).join("\n")
    : "- [ ] —";

  return `## ${entry.date} · ${entry.type}${entry.direction ? ` · ${entry.direction}` : ""}
**${entry.type === "Email" ? "Subject" : "With"}:** ${entry.with}
**Summary:** ${entry.summary}
**Next Steps:**
${nextStepsBlock}
**Source:** ${entry.sourceRef}
**Synced:** ${entry.synced}
${INTERACTION_SEPARATOR}
`;
}

export async function prependInteraction(slug: string, entry: InteractionEntry): Promise<void> {
  const filePath = path.join(process.cwd(), "customers", slug, "interactions.md");
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
  const headerEnd = existing.indexOf("\n\n");
  const header = headerEnd > -1 ? existing.slice(0, headerEnd + 2) : existing;
  const body = headerEnd > -1 ? existing.slice(headerEnd + 2) : "";
  const newContent = header + formatInteractionEntry(entry) + "\n" + body;
  fs.writeFileSync(filePath, newContent, "utf-8");
}
```

---

## LanceDB — Vollständige Setup-Implementierung

```typescript
// src/core/lancedb.ts
import * as lancedb from "@lancedb/lancedb";
import { Schema, Field, FixedSizeList, Float32, Utf8, Int64 } from "apache-arrow";

const DB_PATH = path.join(process.cwd(), ".agentic", "lancedb");
let _db: lancedb.Connection | null = null;

async function getDb(): Promise<lancedb.Connection> {
  if (!_db) _db = await lancedb.connect(DB_PATH);
  return _db;
}

const VECTOR_SCHEMA = new Schema([
  new Field("id", new Utf8(), false),
  new Field("source_ref", new Utf8(), false),     // Idempotenz-Key
  new Field("customer_id", new Utf8(), false),
  new Field("text", new Utf8(), true),             // Volltext für FTS
  new Field("type", new Utf8(), true),             // "email" | "transcript" | "note"
  new Field("date", new Utf8(), true),             // YYYY-MM-DD
  new Field("vector", new FixedSizeList(           // 384 dims für all-MiniLM-L6-v2
    384,
    new Field("item", new Float32(), true)
  ), false),
  new Field("created_at", new Int64(), true),
]);

export async function getCustomerTable(customerId: string): Promise<lancedb.Table> {
  const db = await getDb();
  const name = `docs_${customerId.replace(/[^a-z0-9]/gi, "_")}`;
  try {
    return await db.openTable(name);
  } catch {
    const table = await db.createEmptyTable(name, VECTOR_SCHEMA);
    // Indizes für Performance (async im Hintergrund)
    table.createIndex("source_ref", { config: lancedb.Index.btree() }).catch(() => {});
    return table;
  }
}

export async function indexInLanceDB(
  customerId: string,
  entry: { text: string; type: string; date: string },
  sourceRef: string
): Promise<void> {
  const table = await getCustomerTable(customerId);
  const embedding = await embedText(entry.text);

  // Upsert via mergeInsert (Idempotenz über source_ref)
  await table
    .mergeInsert("source_ref")
    .whenMatchedUpdateAll()
    .whenNotMatchedInsertAll()
    .execute([{
      id: `${customerId}-${Date.now()}`,
      source_ref: sourceRef,
      customer_id: customerId,
      text: entry.text,
      type: entry.type,
      date: entry.date,
      vector: Array.from(embedding),   // Float32Array → number[] für LanceDB
      created_at: BigInt(Date.now()),
    }]);
}

export async function searchKnowledge(
  customerId: string,
  query: string,
  limit = 10
): Promise<Array<{ text: string; source_ref: string; date: string; score: number }>> {
  const table = await getCustomerTable(customerId);
  const queryVector = await embedText(query);

  const results = await table
    .search(queryVector)
    .where(`customer_id = '${customerId}'`)
    .select(["text", "source_ref", "date"])
    .limit(limit)
    .toArray();

  return results.map((r: any) => ({
    text: r.text,
    source_ref: r.source_ref,
    date: r.date,
    score: 1 - (r._distance ?? 0), // Cosine-Similarity aus Distance
  }));
}
```

---

## Embedder — Singleton Pattern

```typescript
// src/core/embedder.ts
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "path";
import os from "os";

// Cache außerhalb node_modules (sonst bei npm ci gelöscht)
env.cacheDir = process.env.HF_CACHE_DIR
  ?? path.join(os.homedir(), ".cache", "datasynx-opencrm", "models");

class EmbeddingPipeline {
  // Promise-Singleton: verhindert doppeltes Laden bei concurrent Aufrufen
  private static instance: Promise<FeatureExtractionPipeline> | null = null;

  static get(): Promise<FeatureExtractionPipeline> {
    if (!this.instance) {
      console.error("Loading embedding model (first time, ~25MB)...");
      this.instance = pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"    // Xenova-Prefix funktioniert in @huggingface/transformers v3
      ) as Promise<FeatureExtractionPipeline>;
    }
    return this.instance;
  }
}

export async function embedText(text: string): Promise<Float32Array> {
  const extractor = await EmbeddingPipeline.get();
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,    // L2-Normalisierung (wichtig für Cosine-Similarity)
  });
  return output.data as Float32Array;
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const extractor = await EmbeddingPipeline.get();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return (output as any[]).map((o) => o.data as Float32Array);
}
```

---

## Daemon — Background Sync

```typescript
// src/daemon/worker.ts — läuft als detached Prozess
import { CronJob } from "cron";
import fs from "fs";
import path from "path";
import os from "os";

const PID_FILE = path.join(os.homedir(), ".config", "datasynx-opencrm", "daemon.pid");
const STATUS_FILE = path.join(os.homedir(), ".config", "datasynx-opencrm", "daemon-status.json");

// Eigene PID beim Start schreiben
fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
fs.writeFileSync(PID_FILE, String(process.pid));

let lastSync: string | null = null;
let syncCount = 0;

const syncJob = CronJob.from({
  cronTime: "*/15 * * * *",      // Alle 15 Minuten
  onTick: async () => {
    console.error(`[${new Date().toISOString()}] Sync cycle starting...`);
    try {
      await runAllCustomerSync();
      lastSync = new Date().toISOString();
      syncCount++;
      fs.writeFileSync(STATUS_FILE, JSON.stringify({
        pid: process.pid, startedAt: daemonStartTime,
        lastSync, syncCount, status: "running",
      }));
    } catch (err) {
      console.error("Sync error:", (err as Error).message);
    }
  },
  start: true,
  waitForCompletion: true,  // Kein concurrent run wenn sync länger dauert
});

const daemonStartTime = new Date().toISOString();

process.on("SIGTERM", () => {
  syncJob.stop();
  fs.existsSync(PID_FILE) && fs.unlinkSync(PID_FILE);
  process.exit(0);
});

process.on("SIGINT", () => {
  syncJob.stop();
  fs.existsSync(PID_FILE) && fs.unlinkSync(PID_FILE);
  process.exit(0);
});

console.error(`[${daemonStartTime}] DatasynxOpenCRM Daemon started (PID ${process.pid})`);
```

---

## Terminal UI — Output-Konventionen

```typescript
// src/ui/colors.ts
import ansis from "ansis";

export const ui = {
  success: (msg: string) => console.log(ansis.green(`✓ ${msg}`)),
  error: (msg: string) => console.error(ansis.red(`✗ ${msg}`)),
  warning: (msg: string) => console.log(ansis.yellow(`⚠ ${msg}`)),
  info: (msg: string) => console.log(ansis.cyan(`ℹ ${msg}`)),
  muted: (msg: string) => console.log(ansis.dim(msg)),
  header: (msg: string) => console.log(ansis.bold(msg)),

  status: {
    active: (s: string) => ansis.green(s),
    inactive: (s: string) => ansis.yellow(s),
    churned: (s: string) => ansis.red(s),
  },

  dealHealth: {
    active: "🟢",
    stale: "⚠️",
    blocked: "🔴",
  },
};
```

```typescript
// src/ui/table.ts
import Table from "cli-table3";
import { ui } from "./colors.js";

export function renderCustomerList(customers: CustomerSummary[]): void {
  const table = new Table({
    head: ["ID", "Name", "Status", "Owner", "Last Touchpoint", "Open Deals"],
    colWidths: [14, 22, 10, 12, 16, 12],
    style: { head: [], border: [] },
  });

  for (const c of customers) {
    table.push([
      ansis.dim(c.id),
      c.name,
      ui.status[c.status](c.status),
      c.owner,
      c.lastTouchpoint,
      c.openDeals > 0 ? ansis.cyan(String(c.openDeals)) : ansis.dim("0"),
    ]);
  }

  console.log(table.toString());
  console.log(ansis.dim(`  ${customers.length} customer(s)`));
}
```

---

## Dokumentationspflicht — Was bei jedem Feature mitgeliefert wird

### Bei jedem neuen MCP-Tool

1. `src/mcp/capabilities.ts` → Tool-Eintrag ergänzen
2. `docs/mcp-tools.md` → Vollständige Dokumentation (Schema, Beispiel-Request, Beispiel-Response)
3. `README.md` → Tool in der Übersichtstabelle ergänzen

### Bei jedem neuen CLI-Command

1. `docs/cli-reference.md` → Command, Flags, Beispiele
2. `README.md` → Quick-Reference aktualisieren

### `dxcrm guide` Output

`dxcrm guide` gibt immer `CAPABILITIES_TEXT` aus `src/mcp/capabilities.ts` aus — Single Source of Truth für beide.

---

## Woche-für-Woche Umsetzungsplan

### Woche 1 — Foundation

**Reihenfolge (TDD: Test zuerst):**

```
Tag 1:
□ package.json + tsconfig.json + tsdown.config.ts + vitest.config.ts
□ Test-Setup: vitest + memfs Mock + LanceDB/Transformers Mocks
□ __tests__/schemas/main-facts.test.ts (FAILING)
□ src/schemas/main-facts.ts (PASSING)

Tag 2:
□ __tests__/commands/create.test.ts (FAILING)
□ src/commands/create.ts (PASSING)
□ __tests__/fs/interactions-writer.test.ts (FAILING)
□ src/fs/interactions-writer.ts (PASSING)

Tag 3:
□ __tests__/setup/framework-detector.test.ts (FAILING)
□ src/setup/framework-detector.ts (PASSING)
□ __tests__/setup/framework-writer.test.ts (FAILING)
□ src/setup/framework-writer.ts (PASSING)

Tag 4:
□ src/commands/init.ts (mit Framework-Detector + Writer)
□ src/commands/list.ts
□ src/commands/session.ts
□ src/commands/guide.ts
□ src/cli.ts (Commander Setup)

Tag 5:
□ dxcrm validate Befehl
□ README.md: 5-Minuten-Quickstart
□ docs/cli-reference.md: Woche-1-Commands
□ npm test → alle Tests grün
□ npm run build → erfolgreich
□ Commit + Push
```

**DONE WHEN:** `npx datasynx-opencrm init` + `create "Acme Corp"` + `validate` — alle unter 90s auf sauberer Maschine.

### Woche 2 — Data In

```
Tag 1-2: LanceDB + Embedder
□ __tests__/core/embedder.test.ts
□ src/core/embedder.ts (Singleton)
□ __tests__/core/lancedb.test.ts
□ src/core/lancedb.ts

Tag 3: Gmail Sync
□ __tests__/sync/gmail-sync.test.ts (mit googleapis Mock)
□ src/sync/gmail-sync.ts
□ src/sync/gmail-auth.ts

Tag 4: Transcript Watcher
□ __tests__/sync/transcript-watcher.test.ts (mit tmp-Dir)
□ src/sync/transcript-watcher.ts

Tag 5: Daemon
□ src/daemon/worker.ts
□ src/commands/daemon.ts
□ npm test → grün
□ Commit + Push
```

**DONE WHEN:** Transcript ablegen → 5 Min → in interactions.md. Sync zweimal → null Duplikate.

### Woche 3 — Agent Can Ask

```
Tag 1-2: Context Builder
□ __tests__/core/context-builder.test.ts (Determinismus, Token-Limit, Performance)
□ src/core/context-builder.ts

Tag 3-4: MCP Server + alle 8 Tools
□ __tests__/mcp/tools/*.test.ts (je Tool)
□ src/mcp/tools/*.ts
□ src/mcp/server.ts

Tag 5:
□ docs/mcp-tools.md (alle 8 Tools)
□ MCP Inspector Test: alle Tools sichtbar und aufrufbar
□ npm test → grün
□ Commit + Push
```

**DONE WHEN:** Agent fragt "Was ist los mit Acme Corp?" → korrekte Antwort in <3s.

### Woche 4 — Full Loop + Erster Kunde

```
Tag 1-2: Write-Back + Backup
□ log_interaction() + update_deal() vollständig
□ dxcrm backup/restore
□ export_customer() MCP-Tool

Tag 3: Error Handling + Robustheit
□ Alle MCP-Tools geben strukturierte Fehler zurück (nie throw)
□ Daemon läuft 24h unbeaufsichtigt (Stress-Test)

Tag 4: Erster User
□ README.md finalisieren (Claude Code, Codex, Hermes Quickstart)
□ docs/ vollständig
□ Erster externer User onboarden

Tag 5: Merge zu main
□ Alle Tests grün
□ Alle Docs synchron
□ npm run build erfolgreich
□ Merge Feature-Branch → main
□ npm publish
```

**DONE WHEN:** Externer User nutzt dxcrm 7 Tage täglich ohne HubSpot.

---

## Bekannte Gotchas — Komplett-Referenz

| # | Bereich | Problem | Lösung |
|---|---|---|---|
| 1 | MCP SDK | `console.log` in stdio → Protokoll kaputt | Immer `console.error()` |
| 2 | MCP SDK | `.js` fehlt bei Imports → Cannot find module | Immer `from "...mcp.js"` |
| 3 | MCP SDK | `server.tool()` → deprecated in v2 | `server.registerTool()` |
| 4 | MCP SDK | `instructions` im Konstruktor → v1.x hat das nicht | Instructions in Tool-Description |
| 5 | LanceDB | `Float64` für Vektoren → Speicher-Overhead | `new Float32()` im Schema |
| 6 | LanceDB | `mergeInsert` ohne BTree-Index → Full-Scan | BTree-Index auf `source_ref` |
| 7 | LanceDB | FTS-Index-Build ist async → erste Queries langsam | Erwartet + dokumentiert |
| 8 | LanceDB | Alpine-Linux → native Binary fehlt | `node:20-slim` Docker-Image |
| 9 | Transformers | Cache in `node_modules` → bei `npm ci` gelöscht | `env.cacheDir` explizit setzen |
| 10 | Transformers | Concurrent Requests → Modell doppelt geladen | Promise-Singleton-Pattern |
| 11 | Gmail | `@gongrzhe` Package archiviert März 2026 | Eigene Impl. mit `googleapis` |
| 12 | chokidar v4 | `watch('**/*.txt')` → Glob entfernt → silently nichts | Ordner watchen + ignored Function |
| 13 | chokidar v4 | Linux: `add` Event vor vollständigem Schreiben | `awaitWriteFinish.stabilityThreshold: 2000` |
| 14 | cron | `'*/15 * * * * *'` (6-stellig) = alle 15 Sekunden | 5-stellig für Minuten: `'*/15 * * * *'` |
| 15 | chalk v5 | ESM-only → `ERR_REQUIRE_ESM` in CJS | `ansis` verwenden |
| 16 | ora | ESM-only | `@topcli/spinner` verwenden |
| 17 | postinstall | pnpm v10 blockiert es | Lazy Detection in `dxcrm init` |
| 18 | tsup | Nicht mehr maintained | `tsdown` verwenden |
| 19 | fastembed | Archiviert Jan 2026 | `@huggingface/transformers` v3.8.1 |
| 20 | Claude Code | `alwaysAllow` Bug — resettet bei Neustart | `.claude/settings.json` permissions |
| 21 | Commander | `parse()` ignoriert async returns | Immer `parseAsync()` |
| 22 | Daemon | `stdio: 'inherit'` hält Parent offen | `stdio: ['ignore', logFd, logFd]` + `child.unref()` |

---

*plan-1.md — Technischer Implementierungsplan Phase 1*
*Basiert auf Deep-Search-Recherche Mai 2026 · Nächstes Update: nach Woche 1 abgeschlossen*
