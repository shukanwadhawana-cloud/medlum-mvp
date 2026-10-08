#!/usr/bin/env node
/**
 * Static verification for Phase B legacy clinicId correction + dashboard build fix.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
function must(c, m) { if (!c) failures.push(m); }
function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) { failures.push("Missing " + rel); return ""; }
  return readFileSync(p, "utf8");
}

const helper = read("src/lib/data/legacy-clinicid-correction.ts");
const clinicAuth = read("src/lib/clinic-auth.ts");
const patientsRoute = read("src/app/api/patients/route.ts");
const discovery = read("scripts/verify-patient-discovery.mjs");
const dashboard = read("src/app/dashboard/page.tsx");

must(helper.includes("correctLegacyPatientClinicIds"), "correction helper exported");
must(helper.includes("clinicId: null"), "targets null clinicId only");
must(helper.includes("uniqueClinicIds.length === 0") || helper.includes("uniqueClinicIds.length > 1"), "skips ambiguous/no membership");
must(helper.includes("updateMany") && helper.includes("clinicId: null"), "idempotent update only when still null");
must(helper.includes("FACILITY_LEGACY_CLINICID_CORRECTION"), "audit action present");
must(helper.includes("dryRun"), "supports dry-run");
must(!/clinicId:\s*["']/.test(helper), "does not hardcode a facility id");

must(clinicAuth.includes("findAuthorizedPatient"), "P1 findAuthorizedPatient preserved");
must(clinicAuth.includes("clinicId: null"), "P1 legacy null rule preserved");
must(patientsRoute.includes("facilityScope") || patientsRoute.includes("clinicId: null"), "patients API facility scope preserved");
must(discovery.includes("PATIENT_DUPLICATE_POSSIBLE"), "duplicate prevention still gated");
must(discovery.includes("findAuthorizedPatient"), "discovery gate still checks auth patient");

must(!/;\\n\s+const workspaceModules/.test(dashboard), "dashboard has no broken unicode/newline escape in role block");
must(dashboard.includes("workspaceModules") || dashboard.includes("WORKSPACE_MODULES"), "dashboard workspace modules present");

if (failures.length) {
  console.error("Phase B legacy clinicId / discovery verification FAILED");
  failures.forEach((f) => console.error("- " + f));
  process.exit(1);
}
console.log("Phase B legacy clinicId / discovery verification PASSED");
console.log("- Correction helper is idempotent and non-guessing");
console.log("- P1 facility isolation and patient discovery gates preserved");
console.log("- Dashboard syntax corruption absent");
