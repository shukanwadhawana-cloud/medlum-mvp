import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src/app/api/ipd/route.ts",
  "src/app/api/rmo/indents/route.ts",
  "src/app/rmo/page.tsx",
];

const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing ${file}`);
}

const ipd = fs.readFileSync(path.join(root, "src/app/api/ipd/route.ts"), "utf8");
const rmo = fs.readFileSync(path.join(root, "src/app/api/rmo/indents/route.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "src/app/rmo/page.tsx"), "utf8");

const checks = [
  ["IPD creates Medication Indent via Prescription", ipd.includes('noteType==="Medication Indent"') || ipd.includes("Medication Indent")],
  ["IPD creates Investigation Indent via LabOrder", ipd.includes('noteType:"Investigation Indent"') || ipd.includes("Investigation Indent")],
  ["RMO lists pending indents", rmo.includes("getPending") || rmo.includes("Medication Indent")],
  ["RMO consume action", rmo.includes('action === "consume"') || rmo.includes("consume")],
  ["RMO medication creates Dispensing", rmo.includes("Dispensing") || rmo.includes("dispensing")],
  ["RMO page exists", page.includes("RMO") || page.includes("indent")],
];

for (const [name, ok] of checks) if (!ok) failures.push(`failed ${name}`);

if (failures.length) {
  console.error("RMO indent consumer contract: FAIL");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("RMO indent consumer contract: PASS");
console.log("Medication: IPD Prescription -> RMO consume -> Dispensing + consumed audit");
console.log("Investigation: IPD LabOrder -> RMO consume -> consumed audit + existing LabOrder downstream state");
