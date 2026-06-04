// src/sync/converters/xlsx.ts
import type { Converter, ConversionResult } from "./types.js";
import { rowsToMarkdown } from "./text.js";

/** Render a single ExcelJS cell value as plain text. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v["text"] === "string") return v["text"];
    if ("result" in v) return String(v["result"] ?? "");
    if (Array.isArray(v["richText"])) {
      return (v["richText"] as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    }
    if ("hyperlink" in v) return String(v["text"] ?? v["hyperlink"] ?? "");
  }
  return String(value);
}

/**
 * Spreadsheet (XLSX) → Markdown via ExcelJS. Each worksheet becomes a
 * `## <sheet name>` section followed by a GitHub-flavored Markdown table.
 * ExcelJS is loaded lazily.
 */
export const xlsxConverter: Converter = {
  name: "xlsx",
  extensions: ["xlsx", "xlsm"],
  mimeTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  async convert(buffer: Buffer): Promise<ConversionResult> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    // ExcelJS's typings predate the @types/node generic Buffer; widen via ArrayBuffer.
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const sections: string[] = [];
    const sheetNames: string[] = [];
    wb.eachSheet((sheet) => {
      sheetNames.push(sheet.name);
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          cells.push(cellText(cell.value));
        });
        rows.push(cells);
      });
      const table = rowsToMarkdown(rows);
      if (table) sections.push(`## ${sheet.name}\n\n${table}`);
    });

    return { markdown: sections.join("\n\n"), meta: { format: "xlsx", sheets: sheetNames } };
  },
};
