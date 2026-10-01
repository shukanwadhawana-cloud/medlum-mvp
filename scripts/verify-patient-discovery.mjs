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
assert(patientsRoute.includes("facilityScope") || patientsRoute.includes("memberDoctorIds"), "patients GET facility scope");
assert(patientsRoute.includes("clinicId: null"), "patients GET includes legacy null clinicId");
assert(!/const where: any = \{ clinicId,/.test(patientsRoute), "patients GET no longer uses strict clinicId-only where");

const clinicAuth = read("src/lib/clinic-auth.ts");
assert(clinicAuth.includes("doctorIds"), "findAuthorizedPatient facility members");
assert(clinicAuth.includes("clinicId: null"), "findAuthorizedPatient legacy null clinicId");

const emergency = read("src/app/api/emergency/route.ts");
assert(emergency.includes("findAuthorizedPatient"), "emergency POST uses findAuthorizedPatient");
assert(!/where: \{ id: patientId, clinicId: ctx\.clinicId \}/.test(emergency), "emergency POST no strict clinicId-only patient lookup");

const appointments = read("src/app/api/appointments/route.ts");
assert(appointments.includes("findAuthorizedPatient"), "appointments POST uses findAuthorizedPatient");

const api = read("src/lib/api.ts");
assert(api.includes("Could not load patients"), "apiGetPatients fails loud");
assert(api.includes("Could not load emergency cases"), "apiGetEmergencyCases fails loud");
assert(api.includes("Could not load appointments"), "apiGetAppointments fails loud");
assert(!/apiGetPatients[\s\S]{0,200}if \(!res\.ok\) return \[\]/.test(api), "apiGetPatients does not swallow errors as []");

const emergencyPage = read("src/app/emergency/page.tsx");
assert(emergencyPage.includes("Could not load emergency data") || emergencyPage.includes("catch"), "emergency page surfaces load errors");

console.log("\nPatient discovery hardening checks passed.");
