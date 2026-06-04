// src/sync/converters/docx.ts
import type { Converter, ConversionResult } from "./types.js";
import { htmlToMarkdown } from "./html.js";

/**
 * DOCX → Markdown via mammoth (DOCX → semantic HTML) then Turndown (HTML →
 * Markdown). Mammoth's own Markdown output is deprecated; the HTML route keeps
 * tables, lists and headings intact. mammoth is loaded lazily.
 */
export const docxConverter: Converter = {
  name: "docx",
  extensions: ["docx"],
  mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  async convert(buffer: Buffer): Promise<ConversionResult> {
    const mammoth = (await import("mammoth")).default;
    const { value: html, messages } = await mammoth.convertToHtml({ buffer });
    const markdown = await htmlToMarkdown(html);
    return {
      markdown,
      meta: { format: "docx", warnings: messages.filter((m) => m.type === "warning").length },
    };
  },
};
