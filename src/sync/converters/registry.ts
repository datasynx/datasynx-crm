// src/sync/converters/registry.ts
import type { Converter, ConversionResult } from "./types.js";
import { textConverter } from "./text.js";
import { docxConverter } from "./docx.js";
import { xlsxConverter } from "./xlsx.js";
import { pptxConverter } from "./pptx.js";
import { pdfConverter } from "./pdf.js";
import { htmlConverter } from "./html.js";
import { imageConverter } from "./image.js";

/**
 * Fallback converter for unknown/binary attachments: emit a small metadata stub
 * instead of garbage bytes, so the attachment is still recorded and linkable.
 */
export const fallbackConverter: Converter = {
  name: "binary",
  extensions: [],
  convert(buffer: Buffer, filename: string): Promise<ConversionResult> {
    const kb = Math.max(1, Math.round(buffer.length / 1024));
    return Promise.resolve({
      markdown: `> _Binary attachment \`${filename}\` (${kb} KB) — no text representation available._`,
      meta: { format: "binary", bytes: buffer.length },
    });
  },
};

/**
 * Ordered converter registry. Earlier entries win on extension conflicts. The
 * text converter is intentionally last among the "real" converters so that more
 * specific formats (html, etc.) take precedence over generic text matching.
 */
export const CONVERTERS: Converter[] = [
  docxConverter,
  xlsxConverter,
  pptxConverter,
  pdfConverter,
  imageConverter,
  htmlConverter,
  textConverter,
];

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function mimeMatches(converter: Converter, mime: string): boolean {
  if (!converter.mimeTypes) return false;
  const lower = mime.toLowerCase();
  return converter.mimeTypes.some((m) => {
    const ml = m.toLowerCase();
    if (ml.endsWith("/*")) return lower.startsWith(ml.slice(0, -1));
    return ml === lower;
  });
}

/**
 * Pick the converter for an attachment by file extension first (most reliable
 * for Gmail attachments, which always carry a filename), then by MIME type.
 * Returns `undefined` when nothing matches.
 */
export function matchConverter(filename: string, mime?: string): Converter | undefined {
  const ext = extensionOf(filename);
  if (ext) {
    const byExt = CONVERTERS.find((c) => c.extensions.includes(ext));
    if (byExt) return byExt;
  }
  if (mime) {
    const byMime = CONVERTERS.find((c) => mimeMatches(c, mime));
    if (byMime) return byMime;
  }
  return undefined;
}

/**
 * Convert an attachment to Markdown, dispatching to the best converter and
 * falling back to a metadata stub. Converter errors never throw: they are
 * swallowed into the fallback so a single bad attachment can't break a sync.
 */
export async function convertAttachment(
  buffer: Buffer,
  filename: string,
  mime?: string
): Promise<ConversionResult> {
  const converter = matchConverter(filename, mime) ?? fallbackConverter;
  try {
    const result = await converter.convert(buffer, filename);
    if (!result.markdown.trim()) {
      return {
        markdown: `> _Attachment \`${filename}\` contained no extractable text._`,
        meta: { ...result.meta, empty: true },
      };
    }
    return result;
  } catch (err) {
    process.stderr.write(
      `[converters] ${converter.name} failed for ${filename}: ${(err as Error).message}\n`
    );
    return fallbackConverter.convert(buffer, filename);
  }
}
