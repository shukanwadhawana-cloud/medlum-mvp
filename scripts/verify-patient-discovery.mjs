/**
 * Static + structural checks for master-patient discovery hardening.
 * Does not require a live database.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("OK:", msg);
}

const patientsRoute = read("src/app/api/patients/route.ts");
const patientsPage = read("src/app/patients/page.tsx");
const newPatientPage = read("src/app/patients/new/page.tsx");
const clinicAuth = read("src/lib/clinic-auth.ts");
const emergency = read("src/app/api/emergency/route.ts");
const appointments = read("src/app/api/appointments/route.ts");
const emergencyPage = read("src/app/emergency/page.tsx");
const ipdRoute = read("src/app/api/ipd/route.ts");
const api = read("src/lib/api.ts");

assert(patientsRoute.includes("facilityScope"), "patients GET uses facility scope");
assert(patientsRoute.includes("memberDoctorIds"), "patients GET builds active facility member doctor set");
assert(patientsRoute.includes("clinicId: null"), "patients GET considers legacy null clinicId");
assert(patientsRoute.includes("doctorId: { in: memberDoctorIds }"), "legacy null patients remain membership-bounded");
assert(!/const where:\s*any\s*=\s*\{\s*clinicId\s*,/.test(patientsRoute), "patients GET no longer uses clinicId-only scope");
assert(patientsRoute.includes("where.AND.push(...searchAnd)"), "patient search preserves facility scope while adding criteria");
assert(patientsRoute.includes("isSearchMode"), "patients GET has explicit search mode");
assert(patientsRoute.includes('view === "search"'), "patients GET recognizes deep search");
assert(patientsRoute.includes('patient: { OR: [{ clinicId }, { clinicId: null, doctorId: { in: memberDoctorIds } }] }'), "appointments view includes authorized legacy patients");
assert(patientsPage.includes('params.set("view", "search")'), "Patient Index deep search explicitly requests search mode");
assert(patientsPage.includes("deepDob"), "Patient Index includes DOB in deep-search dependencies");
assert(newPatientPage.includes("PATIENT_DUPLICATE_POSSIBLE"), "registration UI handles duplicate candidates");
assert(patientsRoute.includes("PATIENT_DUPLICATE_POSSIBLE"), "registration API returns duplicate candidate code");
assert(patientsRoute.includes("status: 409"), "duplicate registration is a conflict response");
assert(patientsRoute.includes("candidates"), "duplicate response contains candidates");
assert(!/auto-merge patients|merge existing patient/i.test(patientsRoute), "duplicate protection does not auto-merge");

assert(clinicAuth.includes("doctorIds"), "findAuthorizedPatient uses facility member doctors");
assert(clinicAuth.includes("clinicId: null"), "findAuthorizedPatient permits bounded legacy null patients");
assert(emergency.includes("findAuthorizedPatient"), "emergency POST uses authorized patient lookup");
assert(!/where: \{ id: patientId, clinicId: ctx\.clinicId \}/.test(emergency), "emergency POST has no strict clinicId-only patient lookup");
assert(appointments.includes("findAuthorizedPatient"), "appointments POST uses authorized patient lookup");
assert(api.includes("Could not load patients"), "apiGetPatients fails loudly");
assert(!/apiGetPatients[\s\S]{0,280}if\s*\(\s*!res\.ok\s*\)\s*return\s*\[\]/.test(api), "apiGetPatients does not swallow errors as []");
assert(emergencyPage.includes("Could not load emergency data") || emergencyPage.includes("catch"), "emergency page surfaces load errors");
assert(ipdRoute.includes("$transaction") && ipdRoute.includes("DISCHARGE_COMPLETE"), "IPD atomic discharge path remains intact");

console.log("\nPatient discovery hardening checks passed.");
