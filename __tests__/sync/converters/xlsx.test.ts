import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { xlsxConverter } from "../../../src/sync/converters/xlsx.js";

async function makeXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("People");
  sheet.addRow(["name", "age"]);
  sheet.addRow(["Ada", 36]);
  sheet.addRow(["Grace", 41]);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

describe("xlsxConverter", () => {
  it("renders each sheet as a section with a Markdown table", async () => {
    const buf = await makeXlsx();
    const res = await xlsxConverter.convert(buf, "people.xlsx");
    expect(res.markdown).toContain("## People");
    expect(res.markdown).toContain("| name | age |");
    expect(res.markdown).toContain("| Ada | 36 |");
    expect(res.meta?.["sheets"]).toEqual(["People"]);
  });

  it("renders Date, formula, richText, hyperlink and empty cell value shapes", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Mixed");
    sheet.addRow(["kind", "value"]);
    sheet.getCell("A2").value = "date";
    sheet.getCell("B2").value = new Date("2026-01-15T12:00:00Z");
    sheet.getCell("A3").value = "formula";
    sheet.getCell("B3").value = { formula: "1+1", result: 2 };
    sheet.getCell("A4").value = "rich";
    sheet.getCell("B4").value = { richText: [{ text: "He" }, { text: "llo" }] };
    sheet.getCell("A5").value = "link";
    sheet.getCell("B5").value = { text: "site", hyperlink: "https://example.com" };
    sheet.getCell("A6").value = "empty";
    sheet.getCell("B6").value = null;
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await xlsxConverter.convert(buf, "mixed.xlsx");
    expect(res.markdown).toContain("2026-01-15");
    expect(res.markdown).toContain("| formula | 2 |");
    expect(res.markdown).toContain("| rich | Hello |");
    expect(res.markdown).toContain("| link | site |");
  });

  it("returns empty markdown for a workbook with no rows", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Empty");
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await xlsxConverter.convert(buf, "empty.xlsx");
    expect(res.markdown).toBe("");
    expect(res.meta?.["sheets"]).toEqual(["Empty"]);
  });
});
