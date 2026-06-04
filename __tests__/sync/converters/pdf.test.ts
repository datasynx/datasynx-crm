import { describe, it, expect, vi, beforeEach } from "vitest";

const getDocumentProxy = vi.fn();
const extractText = vi.fn();
vi.mock("unpdf", () => ({ getDocumentProxy, extractText }));

beforeEach(() => {
  vi.clearAllMocks();
  getDocumentProxy.mockResolvedValue({});
});

describe("pdfConverter", () => {
  it("returns the extracted digital text layer", async () => {
    extractText.mockResolvedValue({ totalPages: 3, text: "Hello PDF" });
    const { pdfConverter } = await import("../../../src/sync/converters/pdf.js");
    const res = await pdfConverter.convert(Buffer.from("%PDF"), "doc.pdf");
    expect(res.markdown).toBe("Hello PDF");
    expect(res.meta?.["pages"]).toBe(3);
  });

  it("joins per-page arrays", async () => {
    extractText.mockResolvedValue({ totalPages: 2, text: ["one", "two"] });
    const { pdfConverter } = await import("../../../src/sync/converters/pdf.js");
    const res = await pdfConverter.convert(Buffer.from("%PDF"), "doc.pdf");
    expect(res.markdown).toBe("one\n\ntwo");
  });

  it("flags scanned PDFs (no text layer) as OCR candidates", async () => {
    extractText.mockResolvedValue({ totalPages: 1, text: "   " });
    const { pdfConverter } = await import("../../../src/sync/converters/pdf.js");
    const res = await pdfConverter.convert(Buffer.from("%PDF"), "scan.pdf");
    expect(res.markdown).toBe("");
    expect(res.meta?.["ocrCandidate"]).toBe(true);
  });
});
