#!/usr/bin/env node
// Consumer ESM integration test — verifies the built package is importable as ESM.
// Run from project root after `npm run build`: node __tests__/e2e/consumer-esm.mjs
import { readFileSync } from "fs";
import { resolve } from "path";

const projectRoot = new URL("../../", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf-8"));
const exportPath = resolve(projectRoot, pkg.exports["."].import.default);

const mod = await import(exportPath);

const required = ["createCustomer", "runBackup", "getRbacConfig", "VERSION"];
const missing = required.filter((k) => !(k in mod));

if (missing.length > 0) {
  console.error(`✗ ESM Consumer Test FAILED — missing exports: ${missing.join(", ")}`);
  process.exit(1);
}

if (typeof mod.VERSION !== "string") {
  console.error(`✗ ESM Consumer Test FAILED — VERSION is not a string`);
  process.exit(1);
}

console.log(`✅ ESM Consumer Test passed — ${pkg.name}@${pkg.version}`);
console.log(`   Entry: ${pkg.exports["."].import.default}`);
console.log(`   VERSION: ${mod.VERSION}`);
