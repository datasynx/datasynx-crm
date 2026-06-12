#!/usr/bin/env tsx
/**
 * Guard (#93): the @huggingface/transformers *Node* bundle must not import
 * onnxruntime-web. onnxruntime-web (~131 MB) is a hard dependency of
 * transformers and installs for every consumer, but the Node runtime path only
 * loads onnxruntime-node. We document it as prunable dead weight in
 * docs/deployment.md (with an optional self-hoster override recipe); this guard
 * fails loudly if a future transformers bump starts loading it on Node, so that
 * documentation can't silently become wrong. Offline, Node built-ins only.
 *
 * Exit code 1 when a Node bundle imports onnxruntime-web; graceful skip (exit 0)
 * when the dependency is not installed (e.g. a dev tree without node_modules).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const BUNDLES = [
  "node_modules/@huggingface/transformers/dist/transformers.node.mjs",
  "node_modules/@huggingface/transformers/dist/transformers.node.cjs",
];

/**
 * True if the source contains a real ESM import / CJS require of onnxruntime-web
 * (including subpath specifiers like `onnxruntime-web/webgpu`). String literals
 * such as the jsdelivr CDN URL `https://cdn.jsdelivr.net/npm/onnxruntime-web@...`
 * are intentionally not matched — they are not module specifiers.
 */
export function importsOnnxWeb(source: string): boolean {
  return /(?:\bfrom\s*|\brequire\(\s*)["']onnxruntime-web(?:\/[^"']*)?["']/.test(source);
}

function main(): void {
  const present = BUNDLES.map((b) => path.join(ROOT, b)).filter(fs.existsSync);
  if (present.length === 0) {
    console.log(
      "• @huggingface/transformers Node bundle not found (deps not installed) — skipping #93 guard"
    );
    return;
  }
  const offenders = present.filter((f) => importsOnnxWeb(fs.readFileSync(f, "utf-8")));
  if (offenders.length > 0) {
    console.error(
      `✗ onnxruntime-web is imported by the transformers Node bundle (#93 guard):\n` +
        offenders.map((f) => `  ${path.relative(ROOT, f)}`).join("\n") +
        `\n\nThe documented "unused on the Node path" claim and the optional prune recipe` +
        ` in docs/deployment.md are now invalid — re-verify with` +
        ` \`grep -o "from\\"onnxruntime[^\\"]*" <bundle>\` and update the docs.`
    );
    process.exit(1);
  }
  console.log("✓ onnxruntime-web is not imported on the transformers Node path (#93)");
}

// Run only when invoked directly (not when imported by the unit test).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
