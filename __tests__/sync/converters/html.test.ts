import { describe, it, expect } from "vitest";
import { htmlToMarkdown, htmlConverter } from "../../../src/sync/converters/html.js";

describe("htmlToMarkdown", () => {
  it("converts headings and emphasis", async () => {
    const md = await htmlToMarkdown("<h1>Title</h1><p>Hello <strong>world</strong></p>");
    expect(md).toContain("# Title");
    expect(md).toContain("**world**");
  });

  it("converts tables via the GFM plugin", async () => {
    const md = await htmlToMarkdown(
      "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>"
    );
    // Turndown's GFM plugin pads cells for alignment; normalize whitespace.
    const compact = md.replace(/ +/g, " ");
    expect(compact).toContain("| A | B |");
    expect(compact).toContain("| 1 | 2 |");
  });
});

describe("htmlConverter", () => {
  it("converts an HTML buffer to Markdown", async () => {
    const res = await htmlConverter.convert(Buffer.from("<h2>Hi</h2>"), "page.html");
    expect(res.markdown).toContain("## Hi");
    expect(res.meta?.["format"]).toBe("html");
  });
});
