import { chmodSync, existsSync, readdirSync, copyFileSync } from "fs";

// Make CLI binaries executable
const cliFiles = ["dist/cli.js", "dist/cli.cjs"];
for (const f of cliFiles) {
  if (existsSync(f)) chmodSync(f, 0o755);
}

// tsdown hashes d.ts chunk filenames — create canonical aliases so package.json
// exports (dist/index.d.ts, dist/index.d.cts, etc.) resolve correctly.
const distFiles = readdirSync("dist");
for (const f of distFiles) {
  // Matches: index-HASH.d.ts, mcp-HASH.d.cts, index-HASH.d.ts.map, etc.
  const m = f.match(/^(index|mcp)-[A-Za-z0-9_-]+\.(d\.(ts|cts|mts)(\.map)?)$/);
  if (!m) continue;
  const canonical = `dist/${m[1]}.${m[2]}`;
  copyFileSync(`dist/${f}`, canonical);
}
