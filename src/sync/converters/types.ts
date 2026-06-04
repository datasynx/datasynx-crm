// src/sync/converters/types.ts

/** Result of converting a single attachment to Markdown. */
export interface ConversionResult {
  /** The attachment rendered as Markdown. May be empty if nothing was extractable. */
  markdown: string;
  /** Optional structured metadata about the conversion (page count, sheet names, ocr, …). */
  meta?: Record<string, unknown>;
}

/**
 * A pluggable attachment converter. Each converter declares the file extensions
 * and/or MIME types it handles and exposes a single pure-ish `convert` entry
 * point. Heavy/native dependencies (OCR, PDF, Office parsers) MUST be loaded
 * lazily inside `convert` via dynamic `import()` so the default code path stays
 * light and the registry itself has no heavy import graph.
 */
export interface Converter {
  /** Stable identifier, used in logs and metadata (e.g. "docx", "pdf"). */
  name: string;
  /** Lowercase file extensions without the leading dot, e.g. ["xlsx", "xls"]. */
  extensions: string[];
  /**
   * MIME types this converter handles. An entry ending in "/*" matches by
   * prefix (e.g. "image/*" matches "image/png").
   */
  mimeTypes?: string[];
  /** Convert the raw attachment bytes to Markdown. */
  convert(buffer: Buffer, filename: string): Promise<ConversionResult>;
}
