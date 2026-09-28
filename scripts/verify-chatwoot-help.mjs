import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const lib = path.join(root, "src/lib/chatwoot.ts");
const api = path.join(root, "src/app/api/chatwoot/route.ts");
const ui = path.join(root, "src/components/MedLumChat.tsx");
const shell = path.join(root, "src/components/AppShell.tsx");
const peoplePanel = path.join(root, "src/components/PeopleHRISPanel.tsx");
const peoplePage = path.join(root, "src/app/people/page.tsx");

for (const f of [lib, api, ui, shell]) {
  if (!fs.existsSync(f)) failures.push(`missing ${path.relative(root, f)}`);
}

const libSrc = fs.existsSync(lib) ? fs.readFileSync(lib, "utf8") : "";
const apiSrc = fs.existsSync(api) ? fs.readFileSync(api, "utf8") : "";
const uiSrc = fs.existsSync(ui) ? fs.readFileSync(ui, "utf8") : "";
const shellSrc = fs.existsSync(shell) ? fs.readFileSync(shell, "utf8") : "";

const checks = [
  ["server-only chatwoot lib", libSrc.includes('import "server-only"')],
  ["env credentials only", libSrc.includes("CHATWOOT_API_TOKEN") && !uiSrc.includes("CHATWOOT_API_TOKEN")],
  ["API requires session membership", apiSrc.includes("getSession") && apiSrc.includes("requireActiveClinicMembership")],
  ["conversation clinic isolation", apiSrc.includes("medlum_clinic_id") && apiSrc.includes("medlum_staff_id")],
  ["no clinical payload copy", !apiSrc.includes("clinicalNotes") && !libSrc.includes("ClinicalNote")],
  ["MedLumChat client panel", uiSrc.includes("MedLum Help") && uiSrc.includes("/api/chatwoot")],
  ["AppShell mounts MedLumChat", shellSrc.includes("MedLumChat")],
  ["People HRIS panel not in this PR surface", !fs.existsSync(peoplePanel)],
  ["canonical People page remains", fs.existsSync(peoplePage)],
  ["no SEE_FILE", !libSrc.includes("SEE_FILE") && !apiSrc.includes("SEE_FILE")],
];

for (const [name, ok] of checks) if (!ok) failures.push(`failed ${name}`);

if (failures.length) {
  console.error("Chatwoot Help verification FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log("Chatwoot Help verification PASSED");
for (const [name] of checks) console.log(`✓ ${name}`);
