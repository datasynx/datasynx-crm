import { describe, it, expect, vi, beforeEach } from "vitest";

const recognize = vi.fn();
vi.mock("tesseract.js", () => ({ recognize }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("imageConverter", () => {
  it("OCRs an image and wraps the result", async () => {
    recognize.mockResolvedValue({ data: { text: "invoice total 99" } });
    const { imageConverter } = await import("../../../src/sync/converters/image.js");
    const res = await imageConverter.convert(Buffer.from("PNG"), "scan.png");
    expect(res.markdown).toContain("OCR of `scan.png`");
    expect(res.markdown).toContain("invoice total 99");
    expect(res.meta?.["ocr"]).toBe(true);
  });

  it("returns empty markdown when OCR finds no text", async () => {
    recognize.mockResolvedValue({ data: { text: "   " } });
    const { imageConverter } = await import("../../../src/sync/converters/image.js");
    const res = await imageConverter.convert(Buffer.from("PNG"), "blank.png");
    expect(res.markdown).toBe("");
  });

  it("passes the configured OCR language to tesseract", async () => {
    recognize.mockResolvedValue({ data: { text: "hallo" } });
    process.env["DXCRM_OCR_LANG"] = "deu";
    const { imageConverter } = await import("../../../src/sync/converters/image.js");
    await imageConverter.convert(Buffer.from("PNG"), "x.png");
    expect(recognize).toHaveBeenCalledWith(expect.anything(), "deu");
    delete process.env["DXCRM_OCR_LANG"];
  });
});
