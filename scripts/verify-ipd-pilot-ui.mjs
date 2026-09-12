import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dashboard = read("src/app/dashboard/page.tsx");
const patients = read("src/app/api/patients/route.ts");
const shell = read("src/components/AppShell.tsx");

for (const token of ["OPD", "IPD", "Inpatient / hospital view", "IPD Census & Clinical Dashboard", "Patient / ID", "Allergy", "Diagnosis", "Investigations", "Current medication", "Blood", "BRADMA label", "Consultant / RMO / Nursing notes"]) {
  if (!dashboard.includes(token)) throw new Error(`Missing IPD dashboard contract: ${token}`);
}
for (const token of ["careSetting", "__MEDLUM_CARE_SETTING__", "careSetting === \"IPD\""]) {
  if (!patients.includes(token)) throw new Error(`Missing patient care-setting contract: ${token}`);
}
if (!shell.includes('{ href: "/emergency", label: "Emergency"')) throw new Error("Emergency navigation priority missing");
if (!shell.includes('{ href: "/clinical-assist", label: "AI Assist"')) throw new Error("AI Assist navigation missing");
if (!shell.includes('{ href: "/telemedicine", label: "Video"')) throw new Error("Video navigation missing");
if (!fs.existsSync(path.join(root, "src/app/patients/[id]/label/page.tsx"))) throw new Error("BRADMA label page missing");
console.log("OPD/IPD pilot UI verification passed.");
