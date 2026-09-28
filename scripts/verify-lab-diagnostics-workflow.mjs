import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const required = [
  "src/app/api/labs/route.ts",
  "src/app/api/diagnostics/route.ts",
  "src/app/labs/page.tsx",
  "src/app/diagnostics/page.tsx",
  "src/app/patients/[id]/chart/page.tsx",
];

for (const f of required) {
  if (!fs.existsSync(path.join(root, f))) failures.push(`missing ${f}`);
}

const labsApi = fs.readFileSync(path.join(root, "src/app/api/labs/route.ts"), "utf8");
const diagApi = fs.readFileSync(path.join(root, "src/app/api/diagnostics/route.ts"), "utf8");
const labsUi = fs.readFileSync(path.join(root, "src/app/labs/page.tsx"), "utf8");
const diagUi = fs.readFileSync(path.join(root, "src/app/diagnostics/page.tsx"), "utf8");
const chart = fs.readFileSync(path.join(root, "src/app/patients/[id]/chart/page.tsx"), "utf8");

const checks = [
  ["lab statuses include full lifecycle", ["Ordered", "Sample Pending", "Collected", "Processing", "Result Available", "Awaiting Review", "Resulted", "Reviewed"].every((s) => labsApi.includes(s))],
  ["lab review requires result", labsApi.includes("A result is required before clinical review")],
  ["lab clinic isolation on PATCH", labsApi.includes("patient: { clinicId }")],
  ["lab writeAudit on update", labsApi.includes("writeAudit") && labsApi.includes("LabOrder")],
  ["labs UI patient grouping", labsUi.includes("groupByPatient") || labsUi.includes("PatientGroup")],
  ["labs UI search", labsUi.includes("Search name") || labsUi.includes("search")],
  ["labs UI active/history", labsUi.includes("Active work") || labsUi.includes("queueTab")],
  ["labs UI result entry", labsUi.includes("Enter result") || labsUi.includes("saveResult")],
  ["diag statuses Ordered Performed Reported", ["Ordered", "Performed", "Reported", "Cancelled"].every((s) => diagApi.includes(s))],
  ["diag reported requires findings", diagApi.includes("Findings and impression are required")],
  ["diag writeAudit", diagApi.includes("writeAudit")],
  ["diag facility scope", diagApi.includes("requireActiveClinicMembership")],
  ["diag UI active/history", diagUi.includes("Active") && diagUi.includes("History")],
  ["diag UI report entry", diagUi.includes("Enter report") || diagUi.includes("saveReport")],
  ["diag UI chart link", diagUi.includes("/chart")],
  ["chart shows labs", chart.includes("labOrders") || chart.includes("kind: \"Lab\"")],
  ["chart shows diagnostics", chart.includes("diagnosticOrders") || chart.includes("kind: \"Dx\"")],
  ["no SEE_FILE placeholder", !diagUi.includes("SEE_FILE") && !labsUi.includes("SEE_FILE")],
];

for (const [name, ok] of checks) if (!ok) failures.push(`failed ${name}`);

if (failures.length) {
  console.error("Lab + Diagnostics workflow verification FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log("Lab + Diagnostics workflow verification PASSED");
for (const [name] of checks) console.log(`✓ ${name}`);
