// src/sync/converters/pdf.ts
import type { Converter, ConversionResult } from "./types.js";

/**
 * PDF → Markdown. Extracts the digital text layer with unpdf (a serverless
 * pdf.js build). Scanned PDFs have no text layer; we detect the empty result
 * and flag it as an OCR candidate rather than emitting garbage. unpdf is loaded
 * lazily.
 */
export const pdfConverter: Converter = {
  name: "pdf",
  extensions: ["pdf"],
  mimeTypes: ["application/pdf"],
  async convert(buffer: Buffer): Promise<ConversionResult> {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const merged = (Array.isArray(text) ? text.join("\n\n") : text).trim();

    if (!merged) {
      return {
        markdown: "",
        meta: { format: "pdf", pages: totalPages, ocrCandidate: true },
      };
    }
    return { markdown: merged, meta: { format: "pdf", pages: totalPages } };
  },
};
