import fs from "node:fs";
import assert from "node:assert/strict";

const emergency=fs.readFileSync("src/app/api/emergency/route.ts","utf8");
const page=fs.readFileSync("src/app/emergency/page.tsx","utf8");
const ipd=fs.readFileSync("src/app/api/ipd/route.ts","utf8");
const p201=fs.readFileSync("scripts/verify-p2-01-ipd-discharge.mjs","utf8");
const p202=fs.readFileSync("scripts/verify-p2-02-ipd-bed-lifecycle.mjs","utf8");
const p203=fs.readFileSync("scripts/verify-p2-03-ipd-investigation-review.mjs","utf8");

for(const x of [
  'String(body.action || "") === "admit-to-ipd"',
  'requireClinicalModule(ctx.session.doctorId, "IPD")',
  'access.clinicId !== ctx.clinicId',
  'const admittingRoles = ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO"]',
  'where: { id, clinicId: ctx.clinicId }',
  'where: { id: emergency.patientId, clinicId: ctx.clinicId, deletedAt: null }',
  'patient.status !== "ACTIVE" || careSetting === "IPD"',
  'status: "Admitted"',
  'notes: encodePatientNotes(cleanPatientNotes(patient.notes), "IPD", nextProfile)',
  'isolationLevel: "Serializable"',
  'action: "EMERGENCY_IPD_ADMISSION"',
  'Destination room is not in the hospital directory.',
  'Destination room is already occupied by another active IPD patient.',
  'code === "P2034"',
  'Use the explicit Admit to IPD action for admission.'
]) assert(emergency.includes(x),`P2-04 API regression missing: ${x}`);

assert(!emergency.includes('prisma.patient.create'),"P2-04 must never create a new Patient");
assert(emergency.includes('tx.patient.update({'),"P2-04 must update the existing Patient");
assert(page.includes("Admit to IPD"),"P2-04 UI action missing");
assert(page.includes('window.confirm("Admit this existing patient to IPD?'),"P2-04 admission must require explicit confirmation");
assert(page.includes('action:"admit-to-ipd"'),"P2-04 UI must call the explicit admission action");
assert(!page.includes("Coming Soon"),"P2-04 must not add placeholder UI");
assert(ipd.includes('parseCareSetting(p.notes)==="IPD"&&p.status==="ACTIVE"'),"P2-04 must feed the existing active IPD census");
assert(p201.includes("P2-01"),"P2-01 regression script must remain present");
assert(p202.includes("P2-02"),"P2-02 regression script must remain present");
assert(p203.includes("P2-03"),"P2-03 regression script must remain present");

console.log("P2-04 Emergency → IPD admission continuity verification: PASS");
