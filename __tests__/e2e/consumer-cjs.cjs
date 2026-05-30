#!/usr/bin/env node
// Consumer CJS integration test — verifies the built package is require()-able.
// Run from project root after `npm run build`: node __tests__/e2e/consumer-cjs.cjs
"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
const exportPath = path.resolve(projectRoot, pkg.exports["."].require.default);

const mod = require(exportPath);

const required = ["createCustomer", "runBackup", "getRbacConfig", "VERSION"];
const missing = required.filter((k) => !(k in mod));

if (missing.length > 0) {
  console.error(`✗ CJS Consumer Test FAILED — missing exports: ${missing.join(", ")}`);
  process.exit(1);
}

if (typeof mod.VERSION !== "string") {
  console.error(`✗ CJS Consumer Test FAILED — VERSION is not a string`);
  process.exit(1);
}

console.log(`✅ CJS Consumer Test passed — ${pkg.name}@${pkg.version}`);
console.log(`   Entry: ${pkg.exports["."].require.default}`);
console.log(`   VERSION: ${mod.VERSION}`);
