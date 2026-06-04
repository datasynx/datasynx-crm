// src/sync/converters/html.ts
import type { Converter, ConversionResult } from "./types.js";

/**
 * Convert an HTML fragment to Markdown using Turndown with the GitHub-flavored
 * plugin (tables, strikethrough, task lists). Turndown and the plugin are
 * loaded lazily so they stay out of the light default code path.
 */
export async function htmlToMarkdown(html: string): Promise<string> {
  const TurndownService = (await import("turndown")).default;
  const { gfm } = await import("@joplin/turndown-plugin-gfm");
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  service.use(gfm);
  return service.turndown(html).trim();
}

export const htmlConverter: Converter = {
  name: "html",
  extensions: ["html", "htm", "xhtml"],
  mimeTypes: ["text/html", "application/xhtml+xml"],
  async convert(buffer: Buffer): Promise<ConversionResult> {
    const markdown = await htmlToMarkdown(buffer.toString("utf-8"));
    return { markdown, meta: { format: "html" } };
  },
};
