#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const demo = fs.readFileSync("src/components/PacsFreeSyntheticDemo.tsx", "utf8");
const diagnostics = fs.readFileSync("src/app/diagnostics/page.tsx", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");
const docs = fs.readFileSync("services/pacs/FREE_CLOUD_DEPLOYMENT_STATUS.md", "utf8");

for (const phrase of [
  "PACS SANDBOX",
  "FREE · NO SERVER",
  "SYNTHETIC ONLY",
  "NOT FOR DIAGNOSIS",
  "Open free demo viewer",
  "Previous slice",
  "Next ›",
  "Zoom",
  "Window / level",
  "Reset view",
  "Real image import and OHIF viewing stay disabled",
]) {
  assert.ok(demo.includes(phrase), "PACS demo includes: " + phrase);
}

assert.ok(diagnostics.includes('import PacsFreeSyntheticDemo from "@/components/PacsFreeSyntheticDemo";'), "Diagnostics imports the free demo viewer");
assert.ok(diagnostics.includes("<PacsFreeSyntheticDemo />"), "Diagnostics renders the free demo viewer");
assert.equal(packageJson.scripts["test:pacs-free-demo"], "node scripts/verify-pacs-free-demo.mjs", "package test script is registered");
assert.ok(workflow.includes("npm run test:pacs-free-demo"), "CI runs the free demo regression check");
assert.ok(docs.includes("no-server PACS sandbox"), "deployment docs describe the free demo");

for (const unsafeOrMisleading of [
  "fetch(",
  "localStorage",
  "sessionStorage",
  "/api/imaging-studies",
  "PACS_ENABLED",
  "PrismaClient",
]) {
  assert.ok(!demo.includes(unsafeOrMisleading), "synthetic demo must not use " + unsafeOrMisleading);
}

console.log("Free synthetic PACS sandbox checks: PASS");
