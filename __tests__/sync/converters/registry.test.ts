import { describe, it, expect } from "vitest";
import {
  matchConverter,
  convertAttachment,
  fallbackConverter,
  CONVERTERS,
} from "../../../src/sync/converters/registry.js";

describe("matchConverter", () => {
  it("matches by file extension", () => {
    expect(matchConverter("report.pdf")?.name).toBe("pdf");
    expect(matchConverter("notes.DOCX")?.name).toBe("docx");
    expect(matchConverter("sheet.xlsx")?.name).toBe("xlsx");
    expect(matchConverter("deck.pptx")?.name).toBe("pptx");
    expect(matchConverter("page.html")?.name).toBe("html");
    expect(matchConverter("scan.png")?.name).toBe("image");
    expect(matchConverter("data.csv")?.name).toBe("text");
  });

  it("falls back to MIME type when extension is unknown", () => {
    expect(matchConverter("blob", "application/pdf")?.name).toBe("pdf");
    expect(matchConverter("blob", "image/jpeg")?.name).toBe("image");
  });

  it("returns undefined when nothing matches", () => {
    expect(matchConverter("mystery.bin")).toBeUndefined();
    expect(matchConverter("mystery", "application/octet-stream")).toBeUndefined();
  });

  it("prefers extension over MIME", () => {
    // .csv extension wins even if MIME claims html
    expect(matchConverter("data.csv", "text/html")?.name).toBe("text");
  });
});

describe("fallbackConverter", () => {
  it("emits a metadata stub for binary content", async () => {
    const res = await fallbackConverter.convert(Buffer.alloc(2048), "thing.bin");
    expect(res.markdown).toContain("thing.bin");
    expect(res.markdown).toContain("2 KB");
    expect(res.meta?.["format"]).toBe("binary");
  });
});

describe("convertAttachment", () => {
  it("dispatches CSV to the text converter", async () => {
    const res = await convertAttachment(Buffer.from("a,b\n1,2"), "x.csv");
    expect(res.markdown).toContain("| a | b |");
  });

  it("uses the fallback stub for unknown binary types", async () => {
    const res = await convertAttachment(Buffer.from([0, 1, 2, 3]), "x.bin");
    expect(res.meta?.["format"]).toBe("binary");
  });

  it("reports when a converter yields no extractable text", async () => {
    const res = await convertAttachment(Buffer.from("   \n  "), "empty.txt");
    expect(res.meta?.["empty"]).toBe(true);
    expect(res.markdown).toContain("no extractable text");
  });

  it("registers every converter with a unique name", () => {
    const names = CONVERTERS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
