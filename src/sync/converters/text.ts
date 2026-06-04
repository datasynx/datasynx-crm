// src/sync/converters/text.ts
import type { Converter, ConversionResult } from "./types.js";

/** Escape a CSV cell for safe inclusion in a Markdown table cell. */
function mdCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/**
 * Minimal RFC-4180-ish CSV line splitter: handles quoted fields containing
 * commas and escaped double quotes. Good enough for rendering CSV attachments
 * as readable Markdown tables (we are not round-tripping data).
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Render a matrix of cells as a GitHub-flavored Markdown pipe table. */
export function rowsToMarkdown(rows: string[][]): string {
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]): string[] =>
    Array.from({ length: width }, (_, i) => mdCell(r[i] ?? ""));

  const header = pad(rows[0] ?? []);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
  ];
  return lines.join("\n");
}

/** Render CSV text as a GitHub-flavored Markdown pipe table. */
export function csvToMarkdown(csv: string): string {
  const rows = csv
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(parseCsvLine);
  return rowsToMarkdown(rows);
}

const TEXT_EXTENSIONS = ["txt", "text", "log", "md", "markdown"];
const CODE_FENCE_EXTENSIONS: Record<string, string> = {
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

/**
 * Converter for plain-text-ish attachments: Markdown/text passthrough, CSV/TSV
 * to Markdown tables, and structured text (JSON/XML/YAML) into fenced code
 * blocks so they stay readable and searchable without a heavy parser.
 */
export const textConverter: Converter = {
  name: "text",
  extensions: [...TEXT_EXTENSIONS, "csv", "tsv", ...Object.keys(CODE_FENCE_EXTENSIONS)],
  mimeTypes: ["text/plain", "text/csv", "text/markdown", "application/json", "text/*"],
  convert(buffer: Buffer, filename: string): Promise<ConversionResult> {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const content = buffer.toString("utf-8");

    if (ext === "csv") {
      return Promise.resolve({ markdown: csvToMarkdown(content), meta: { format: "csv" } });
    }
    if (ext === "tsv") {
      const asCsv = content.replace(/\t/g, ",");
      return Promise.resolve({ markdown: csvToMarkdown(asCsv), meta: { format: "tsv" } });
    }
    const fence = CODE_FENCE_EXTENSIONS[ext];
    if (fence) {
      return Promise.resolve({
        markdown: `\`\`\`${fence}\n${content.trim()}\n\`\`\``,
        meta: { format: fence },
      });
    }
    // Markdown / plain text: pass through verbatim.
    return Promise.resolve({ markdown: content.trim(), meta: { format: "text" } });
  },
};
