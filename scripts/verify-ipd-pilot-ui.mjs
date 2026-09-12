import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dashboard = read("src/app/dashboard/page.tsx");
const patientsApi = read("src/app/api/patients/route.ts");
const ipdApi = read("src/app/api/ipd/route.ts");
const ipdPage = read("src/app/ipd/page.tsx");
const shell = read("src/components/AppShell.tsx");
const reports = read("src/app/reports/page.tsx");
const reportsApi = read("src/app/api/reports/route.ts");
const insurance = read("src/app/insurance/page.tsx");

for (const token of ["OPD", "IPD", "Inpatient / hospital view", "IPD Census & Clinical Dashboard", "Patient / ID", "Allergy", "Primary diagnosis", "ICD-10", "Investigations", "Current medication", "Blood", "BRADMA label", "Consultant / RMO / Nursing notes"]) {
  if (!dashboard.includes(token)) throw new Error(`Missing IPD dashboard contract: ${token}`);
}
for (const token of ["careSetting", "__MEDLUM_CARE_SETTING__"]) {
  if (!patientsApi.includes(token)) throw new Error(`Missing patient care-setting contract: ${token}`);
}
for (const token of ["address", "idType", "idNumber", "mlcNumber", "prdNumber", "wardType", "unitType", "roomNumber", "chiefComplaint", "hpi", "pastHistory", "surgicalHistory", "systemicExam", "workingDiagnosis", "consultantName", "consultantSpecialty"]) {
  if (!ipdPage.includes(token) || !ipdApi.includes(token)) throw new Error(`Missing registration/admission contract: ${token}`);
}
for (const token of ["General Ward", "Twin Sharing", "Single Sharing", "Deluxe Ward", "Super Deluxe", "ICU", "MICU", "SICU", "Transplant ICU", "PICU", "NICU"]) {
  if (!ipdPage.includes(token)) throw new Error(`Missing ward/ICU category: ${token}`);
}
for (const token of ["DAMA Summary", "LAMA Summary", "Transfer Summary", "Discharge Summary", "Death Summary", "Fitness Note", "Procedure Note", "Case Summary"]) {
  if (!ipdPage.includes(token)) throw new Error(`Missing clinical document type: ${token}`);
}
for (const token of ["Nursing round vitals", "BP", "Pulse", "RR", "SpO₂", "Temperature", "Consultant Note", "RMO Note", "Nursing Care Note", "bg-blue-50", "bg-amber-50", "bg-green-50"]) {
  if (!ipdPage.includes(token)) throw new Error(`Missing role/vitals contract: ${token}`);
}
if (!ipdPage.includes("MLC number (if applicable)")) throw new Error("MLC registration field missing");
const reportSource = `${reports}\n${reportsApi}`;
for (const pattern of [/mode\s*===\s*["']OPD["']|setMode\(\s*["']OPD["']\s*\)/, /mode\s*===\s*["']IPD["']|setMode\(\s*["']IPD["']\s*\)/, /Separate OPD clinic reporting from IPD hospital reporting/, /careSetting\.counts/, /careSetting\.revenue/]) {
  if (!pattern.test(reportSource)) throw new Error(`Missing OPD/IPD reports contract: ${pattern}`);
}
for (const token of ["PM-JAY / Ayushman Bharat", "ESIC", "Government Scheme", "Corporate / Employer", "Private Insurance"]) {
  if (!insurance.includes(token)) throw new Error(`Missing insurance/scheme contract: ${token}`);
}
if (!shell.includes('{ href: "/ipd", label: "IPD"')) throw new Error("IPD navigation missing");
if (!shell.includes('{ href: "/emergency", label: "Emergency"')) throw new Error("Emergency navigation priority missing");
if (!shell.includes('{ href: "/clinical-assist", label: "AI Assist"')) throw new Error("AI Assist navigation missing");
if (!shell.includes('{ href: "/telemedicine", label: "Video"')) throw new Error("Video navigation missing");
if (!fs.existsSync(path.join(root, "src/app/patients/[id]/label/page.tsx"))) throw new Error("BRADMA label page missing");
console.log("OPD/IPD hospital workflow verification passed.");
