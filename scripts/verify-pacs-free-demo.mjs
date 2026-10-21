#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("src/components/PacsClinicalWorkspace.tsx", "utf8");
const diagnostics = fs.readFileSync("src/app/diagnostics/page.tsx", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");
const docs = fs.readFileSync("services/pacs/FREE_CLOUD_DEPLOYMENT_STATUS.md", "utf8");

for (const phrase of [
  "Imaging workbench",
  "Live clinical records",
  "No verified image series in this viewport",
  "Clinical indication",
  "Findings",
  "Impression",
  "ImagingStudiesPanel",
  "orders.map",
  "selected.patientId",
  "selected.id",
  "No illustrative or fabricated scan is shown here",
]) {
  assert.ok(workspace.includes(phrase), "Clinical imaging workspace includes: " + phrase);
}

assert.ok(diagnostics.includes('import PacsClinicalWorkspace from "@/components/PacsClinicalWorkspace";'), "Diagnostics imports clinical workspace");
assert.ok(diagnostics.includes("<PacsClinicalWorkspace orders={orders} />"), "Diagnostics passes real diagnostic orders");
assert.ok(!diagnostics.includes("PacsFreeSyntheticDemo"), "Diagnostics no longer renders the synthetic illustration");
assert.ok(!workspace.includes("SyntheticSlice"), "Workspace does not generate fake scan anatomy");
assert.ok(!workspace.includes("radialGradient"), "Workspace does not draw a faux radiology scan");
assert.equal(packageJson.scripts["test:pacs-free-demo"], "node scripts/verify-pacs-free-demo.mjs", "regression script remains registered");
assert.ok(workflow.includes("npm run test:pacs-free-demo"), "CI runs the workspace regression check");
assert.ok(docs.includes("clinical imaging workspace"), "deployment docs describe the real-record workspace");

console.log("Clinical imaging workspace contract checks: PASS");
