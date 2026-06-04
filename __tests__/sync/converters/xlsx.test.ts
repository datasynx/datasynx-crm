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
});
