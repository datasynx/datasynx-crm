// src/sync/converters/image.ts
import type { Converter, ConversionResult } from "./types.js";

/**
 * Image → Markdown via Tesseract.js OCR (pure-JS, 100+ languages, fully local).
 * This is the heaviest converter: tesseract.js downloads a WASM core and
 * language data on first use, so it is loaded lazily and only invoked for image
 * attachments. Language defaults to English, override with DXCRM_OCR_LANG.
 */
export const imageConverter: Converter = {
  name: "image",
  extensions: ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp", "gif", "pbm"],
  mimeTypes: ["image/*"],
  async convert(buffer: Buffer, filename: string): Promise<ConversionResult> {
    const lang = process.env["DXCRM_OCR_LANG"] ?? "eng";
    const { recognize } = await import("tesseract.js");
    const {
      data: { text },
    } = await recognize(buffer, lang);
    const ocr = text.trim();
    return {
      markdown: ocr ? `> _OCR of \`${filename}\`:_\n\n${ocr}` : "",
      meta: { format: "image", ocr: true, lang },
    };
  },
};
