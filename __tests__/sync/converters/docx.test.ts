import { describe, it, expect, vi, beforeEach } from "vitest";

const convertToHtml = vi.fn();
vi.mock("mammoth", () => ({ default: { convertToHtml } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("docxConverter", () => {
  it("converts mammoth HTML output to Markdown", async () => {
    convertToHtml.mockResolvedValue({
      value: "<h1>Contract</h1><p>Signed by <em>Acme</em></p>",
      messages: [],
    });
    const { docxConverter } = await import("../../../src/sync/converters/docx.js");
    const res = await docxConverter.convert(Buffer.from("fake-docx"), "contract.docx");
    expect(res.markdown).toContain("# Contract");
    expect(res.markdown).toContain("_Acme_");
    expect(res.meta?.["format"]).toBe("docx");
  });

  it("counts mammoth warnings in meta", async () => {
    convertToHtml.mockResolvedValue({
      value: "<p>x</p>",
      messages: [{ type: "warning", message: "unsupported style" }],
    });
    const { docxConverter } = await import("../../../src/sync/converters/docx.js");
    const res = await docxConverter.convert(Buffer.from("fake"), "x.docx");
    expect(res.meta?.["warnings"]).toBe(1);
  });
});
