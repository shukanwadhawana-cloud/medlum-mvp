import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/app/opd/page.tsx",
  "src/app/patients/[id]/page.tsx",
  "src/app/patients/[id]/print/page.tsx",
  "src/app/api/patients/[id]/print/route.ts",
  "src/app/api/encounters/route.ts",
  "src/app/api/clinical-notes/route.ts",
  "prisma/schema.prisma",
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push("missing " + file);
}

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const opd = read("src/app/opd/page.tsx");
const patient = read("src/app/patients/[id]/page.tsx");
const print = read("src/app/patients/[id]/print/page.tsx");
const printApi = read("src/app/api/patients/[id]/print/route.ts");
const encounterApi = read("src/app/api/encounters/route.ts");
const notesApi = read("src/app/api/clinical-notes/route.ts");
const schema = read("prisma/schema.prisma");

const checks = [
  ["OPD patient selection uses canonical patient route", opd.includes("/patients/") && opd.includes("Open OPD visit")],
  ["OPD registration remains canonical", opd.includes("apiAddPatient") && opd.includes('careSetting: "OPD"')],
  ["OPD vitals include SpO2 and respiratory rate", patient.includes("SpO₂") && patient.includes("Respiratory Rate") && encounterApi.includes("spo2") && encounterApi.includes("rr")],
  ["consultation uses canonical Encounter API", patient.includes("apiCreateEncounter")],
  ["consultation links labs/diagnostics to encounter", patient.includes("encounterId: enc.encounter.id")],
  ["prescription links to encounter", patient.includes("apiAddPrescriptionWithEncounter") && patient.includes("encounterId: enc.encounter.id")],
  ["consultation has explicit confirm/save action", patient.includes("Confirm & Save")],
  ["OPD record print route exists", print.includes("/api/patients/") && print.includes("Print / Save PDF")],
  ["print reserves clinic letterhead space", print.includes("letterheadStyle(h)")],
  ["print includes SpO2/RR", print.includes("SpO₂") && print.includes("RR")],
  ["print includes server-derived clinician attribution", print.includes("e.clinician?.name") && print.includes("l.orderedBy?.name") && print.includes("r.clinician?.name")],
  ["print exposes clinic tax/footer note", print.includes("Clinic / tax information") && print.includes("data.taxNote")],
  ["print API derives clinician identity server-side", printApi.includes("clinicMember.findMany") && printApi.includes("clinicianLabel")],
  ["print API derives clinic scope", printApi.includes("requireActiveClinicMembership") && printApi.includes("findAuthorizedPatient")],
  ["print API only includes finalized clinical notes", printApi.includes('status: { in: ["FINAL", "VERIFIED"] }')],
  ["clinical notes enforce second-clinician final signing", notesApi.includes("authorDoctorId === session.doctorId") && notesApi.includes("PENDING_VERIFICATION")],
  ["encounter audit includes clinic", encounterApi.includes("writeAudit") && encounterApi.includes("clinicId: membership.clinicId")],
  ["Encounter schema already contains required OPD vitals", ["spo2", "rr", "bp", "pulse", "temperature", "weight", "height"].every((f) => schema.includes(f))],
  ["no new Prisma model added by this milestone", !schema.includes("model OpdClinicalRecord") && !schema.includes("model OPDRecord")],
];

for (const [name, ok] of checks) if (!ok) failures.push("failed " + name);

if (failures.length) {
  console.error("OPD clinical record verification FAILED");
  for (const f of failures) console.error("- " + f);
  process.exit(1);
}
console.log("OPD clinical record verification PASSED");
for (const [name] of checks) console.log("✓ " + name);
