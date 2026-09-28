import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const apiPath = path.join(root, "src/app/api/people/route.ts");
const pagePath = path.join(root, "src/app/people/page.tsx");
const schemaPath = path.join(root, "prisma/schema.prisma");

if (!fs.existsSync(apiPath)) failures.push("missing src/app/api/people/route.ts");
if (!fs.existsSync(pagePath)) failures.push("missing src/app/people/page.tsx");

const api = fs.existsSync(apiPath) ? fs.readFileSync(apiPath, "utf8") : "";
const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";
const schema = fs.readFileSync(schemaPath, "utf8");

const checks = [
  ["WorkforceRecord model exists", schema.includes("model WorkforceRecord")],
  ["ClinicMember is canonical staff", schema.includes("model ClinicMember")],
  ["People API requires membership", api.includes("requireActiveClinicMembership")],
  ["People API manager role gate", api.includes("Owner") && api.includes("Manager")],
  ["People API facility-scoped queries", api.includes("clinicId: c.membership.clinicId") || api.includes("clinicId:c.membership.clinicId")],
  ["People API uses WorkforceRecord", api.includes("workforceRecord")],
  ["People API writeAudit", api.includes("writeAudit")],
  ["People page reuses AppShell", page.includes("AppShell")],
  ["People page links to workforce/duty", page.includes("/workforce") && page.includes("/duty")],
  ["People page does not invent Patient model", !page.includes("BillingPatient") && !api.includes("BillingPatient")],
  ["No SEE_FILE", !api.includes("SEE_FILE") && !page.includes("SEE_FILE")],
];

for (const [name, ok] of checks) if (!ok) failures.push(`failed ${name}`);

if (failures.length) {
  console.error("People HRIS workflow verification FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log("People HRIS workflow verification PASSED");
for (const [name] of checks) console.log(`✓ ${name}`);
