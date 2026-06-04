// src/sync/converters/pptx.ts
import type { Converter, ConversionResult } from "./types.js";

/** Extract the visible text runs (`<a:t>…</a:t>`) from one slide's XML. */
export function extractSlideText(xml: string): string {
  const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
    (m[1] ?? "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  );
  return runs.join(" ").replace(/\s+/g, " ").trim();
}

function slideNumber(entryName: string): number {
  const m = entryName.match(/slide(\d+)\.xml$/);
  return m ? parseInt(m[1] ?? "0", 10) : 0;
}

/**
 * PPTX → Markdown. A .pptx is a zip; slide text lives in `ppt/slides/slideN.xml`
 * as `<a:t>` runs. We unzip with adm-zip (already a dependency) and emit one
 * `## Slide N` section per slide — no extra native parser needed.
 */
export const pptxConverter: Converter = {
  name: "pptx",
  extensions: ["pptx"],
  mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  async convert(buffer: Buffer): Promise<ConversionResult> {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buffer);
    const slides = zip
      .getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => slideNumber(a.entryName) - slideNumber(b.entryName));

    const sections: string[] = [];
    for (const entry of slides) {
      const text = extractSlideText(entry.getData().toString("utf-8"));
      if (text) sections.push(`## Slide ${slideNumber(entry.entryName)}\n\n${text}`);
    }
    return { markdown: sections.join("\n\n"), meta: { format: "pptx", slides: slides.length } };
  },
};
