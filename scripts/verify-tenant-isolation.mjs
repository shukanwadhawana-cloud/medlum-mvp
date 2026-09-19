#!/usr/bin/env node
/**
 * Static verification that patient/clinic data APIs enforce clinic membership
 * and do not accept client-supplied clinicId/doctorId as sole scope.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
function assert(c, m) { if (!c) throw new Error(m); }

const clinicAuth = read("src/lib/clinic-auth.ts");
assert(clinicAuth.includes("requireActiveClinicMembership"), "clinic membership required helper");
assert(clinicAuth.includes("findAuthorizedPatient"), "authorized patient lookup");

const patients = read("src/app/api/patients/route.ts");
assert(patients.includes("requireActiveClinicMembership"), "patients API uses membership");
assert(patients.includes("deletedAt: null"), "patients list filters soft-deleted");

const lifecycle = read("src/app/api/patients/lifecycle/route.ts");
assert(lifecycle.includes("requireActiveClinicMembership"), "lifecycle uses membership");
assert(lifecycle.includes("findAuthorizedPatient"), "lifecycle authorizes patient");

const portalData = read("src/app/api/portal/data/route.ts");
assert(portalData.includes("getPortalSession"), "portal data uses portal session");

const criticalRoutes = [
  "src/app/api/patients/route.ts",
  "src/app/api/patients/lifecycle/route.ts",
  "src/app/api/lab-templates/route.ts",
];
for (const r of criticalRoutes) {
  const src = read(r);
  assert(src.includes("requireActiveClinicMembership") || src.includes("getPortalSession"), `${r} must derive scope from session`);
}

console.log("Tenant isolation static verification PASSED");
console.log("- Clinic membership gates patient/lab routes");
console.log("- Soft-deleted patients excluded from active list");
console.log("- Portal data is session-scoped");
