// src/mcp/capabilities.ts
// Single Source of Truth for capability documentation.
// Used by get_capabilities() MCP tool AND dxcrm guide CLI command.

export const CAPABILITIES_TEXT = `
# DatasynxOpenCRM — Agent Guide

## Product
DatasynxOpenCRM is a local-first, MCP-native CRM. All customer data lives in markdown
files on your machine. No cloud, no HubSpot, no per-seat pricing.

## Available Tools

| Tool | Purpose | When to Use |
|---|---|---|
| get_capabilities | Returns this guide | First call in a session |
| get_active_session | Check active customer session | Before assuming context |
| get_customer_context | Full briefing for a customer | Before any customer conversation |
| search_customer_knowledge | Semantic/FTS search across emails & transcripts | "What did they say about X?" |
| list_customers | List all customers with pipeline health | Morning briefing, pipeline overview |
| log_interaction | Write a new interaction entry | After every call/meeting/email |
| update_deal | Update deal stage, value, probability | After pipeline discussions |
| export_customer | Export all customer data as JSON or Markdown | Reporting, backup |

## Tool Reference

### get_capabilities()
Returns all available MCP tools, their inputs, and the CRM workflow guide.
- Input: none
- Returns: This guide text

### get_active_session()
Check which customer is currently active in the session store.
- Input: none
- Returns: { hasSession: boolean, customerSlug?, customerName?, startedAt? }

### get_customer_context({ slug })
Load complete briefing for a customer. Reads main_facts.md, last 10 interactions,
and pipeline deals. Returns a structured markdown context block.
- Input: { slug: string } — Customer ID (e.g. "acme-corp")
- Returns: Formatted markdown with Quick Reference, Contacts, Critical Context,
  Recent Activity, Pipeline, and Open Questions
- Performance: <3 seconds. Token budget: <3000 tokens.

### search_customer_knowledge({ slug, query, limit? })
Hybrid vector + full-text search across all emails and transcripts for a customer.
Searches the LanceDB docs table for the given customer.
- Input: { slug: string, query: string, limit?: number (default 5) }
- Returns: { results: Array<{ content, score, source }> }

### list_customers({ filter? })
List all customers with their stage, last interaction date, and deal value.
- Input: { filter?: string } — Optional substring filter on name or slug
- Returns: Array of { slug, name, stage, lastInteraction?, dealValue? }

### log_interaction({ slug, type, summary, with, nextSteps?, direction?, source? })
Write a new interaction entry to interactions.md. Immediately searchable.
Use after every call, meeting, or email.
- Input:
  slug: Customer ID
  type: "Email" | "Call" | "Meeting" | "Note" | "Demo" | "Proposal" | "Contract" | "Other"
  summary: 2-5 sentences describing what happened
  with: Who was involved (name or email)
  nextSteps?: Array of action items
  direction?: "inbound" | "outbound"
  source?: Source reference string
- Returns: { success: boolean, path: string, entry: string }

### update_deal({ slug, dealName, stage?, value?, probability?, closeDate?, notes? })
Update or create a deal in pipeline.md. Upserts by deal name.
- Input:
  slug: Customer ID
  dealName: Deal name (used as unique key)
  stage?: "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost"
  value?: Deal value in euros
  probability?: Win probability (0-100)
  closeDate?: Expected close date (YYYY-MM-DD)
  notes?: Free-text notes
- Returns: { success: boolean, deal: object }

### export_customer({ slug, format? })
Export all customer data (main_facts + interactions count + pipeline).
- Input: { slug: string, format?: "json" | "markdown" (default "json") }
- Returns: Serialized customer data

## Recommended Workflow

1. User mentions a customer → **get_customer_context({ slug })**
2. Need historical info → **search_customer_knowledge({ slug, query })**
3. After a call/email/meeting → **log_interaction({ slug, type, summary, ... })**
4. Deal stage changed → **update_deal({ slug, dealName, stage, ... })**
5. Morning review → **list_customers()** for pipeline overview

## Data Structure

Customer data lives in \`customers/<slug>/\`:
- \`main_facts.md\` — YAML frontmatter + free-text sections
- \`interactions.md\` — Chronological log (newest first)
- \`pipeline.md\` — Deal table in Markdown
- \`sources.json\` — Gmail/transcript sync config per customer

## Response Format

Always cite sources (gmail://thread/... or file://...) when available.
`.trim();
