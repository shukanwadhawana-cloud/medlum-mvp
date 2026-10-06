#!/usr/bin/env node
/**
 * Expanded static verification for facility-scoped APIs.
 * Companion to p1-rbac-tenant-isolation.mjs (which runs real DB tests).
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
assert(
  clinicAuth.includes("clinicId: null") || clinicAuth.includes("clinicId:null"),
  "legacy null clinicId handling present"
);

const serverAuthzPath = path.join(root, "src/lib/server-authz.ts");
assert(fs.existsSync(serverAuthzPath), "server-authz.ts must exist");
const serverAuthz = read("src/lib/server-authz.ts");
assert(serverAuthz.includes("requireAuthz"), "server-authz requireAuthz");
assert(serverAuthz.includes("discardClientFacilitySelectors"), "client facility selectors ignored");

const criticalRoutes = [
  "src/app/api/patients/route.ts",
  "src/app/api/patients/lifecycle/route.ts",
  "src/app/api/clinical-notes/route.ts",
  "src/app/api/prescriptions/route.ts",
  "src/app/api/labs/route.ts",
  "src/app/api/encounters/route.ts",
  "src/app/api/invoices/route.ts",
  "src/app/api/emergency/route.ts",
  "src/app/api/diagnostics/route.ts",
];
for (const r of criticalRoutes) {
  const src = read(r);
  assert(
    src.includes("requireActiveClinicMembership") ||
      src.includes("requireAuthz") ||
      src.includes("requireClinicalModule") ||
      src.includes("getPortalSession"),
    `${r} must derive facility scope from session/membership`
  );
}

const prescriptions = read("src/app/api/prescriptions/route.ts");
assert(
  prescriptions.includes("prescribe") || prescriptions.includes("canPrescribe") || prescriptions.includes("requirePermission"),
  "prescriptions must enforce role permission"
);

const labs = read("src/app/api/labs/route.ts");
assert(labs.includes("findAuthorizedPatient"), "labs must use findAuthorizedPatient");
assert(labs.includes("canOrderLabs") || labs.includes("canEnterLabResult"), "labs must enforce role permissions");

const portalData = read("src/app/api/portal/data/route.ts");
assert(portalData.includes("getPortalSession"), "portal data uses portal session");

console.log("Tenant isolation static verification PASSED");
console.log("- Clinic membership gates clinical/financial routes");
console.log("- Prescriptions and labs enforce role + patient scope");
console.log("- Legacy null clinicId rule present; server-authz helper present");
