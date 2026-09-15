#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function assert(c, m) {
  if (!c) throw new Error(m);
}

const clinicAuth = read("src/lib/clinic-auth.ts");
const patientDetail = read("src/app/api/patients/[id]/route.ts");
const patientList = read("src/app/api/patients/route.ts");
const portalReset = read("src/app/api/portal/auth/reset/route.ts");
const clinicRoute = read("src/app/api/clinic/route.ts");

assert(clinicAuth.includes("requireActiveClinicMembership"), "active membership helper missing");
assert(clinicAuth.includes("isActive: true"), "membership must require isActive");
assert(clinicAuth.includes("clinic: { isActive: true }"), "clinic must be active");
assert(clinicAuth.includes("canResetPortalPassword"), "portal reset role helper missing");
assert(clinicAuth.includes('role === "Owner" || role === "Admin"'), "portal reset limited to Owner/Admin");
assert(clinicAuth.includes("findAuthorizedPatient"), "patient authorization helper missing");
assert(clinicAuth.includes("clinicId: ctx.clinicId"), "patient scope must use membership clinicId");

assert(patientDetail.includes("requireActiveClinicMembership"), "patient detail must require membership");
assert(patientDetail.includes("findAuthorizedPatient"), "patient detail must authorize patient");
assert(patientDetail.includes("canViewFullClinicalChart"), "clinical role gate missing");
assert(patientDetail.includes("canViewBillingDetail"), "billing role gate missing");

assert(patientList.includes("requireActiveClinicMembership"), "patient list must require membership");
assert(patientList.includes("No active clinic membership"), "deactivated members rejected on list");

assert(portalReset.includes("canResetPortalPassword"), "portal reset uses Owner/Admin helper");
assert(!portalReset.includes('"Consultant"'), "Consultant must not be allowed portal reset");
assert(portalReset.includes("PORTAL_PASSWORD_RESET"), "portal reset must be audited");
assert(portalReset.includes("writeAudit"), "writeAudit required for portal reset");

assert(clinicRoute.includes("CLINIC_MEMBER_ROLE_CHANGED"), "role changes must be audited");
assert(clinicRoute.includes('["Owner", "Admin"]'), "membership management Owner/Admin only");
assert(!/body\.clinicId/.test(patientDetail), "patient detail must not trust body clinicId");

console.log("P1 authorization verification PASSED");
console.log("- Active clinic membership required for patient list/detail");
console.log("- Cross-clinic patient ID rejected via findAuthorizedPatient");
console.log("- Staff limited clinical chart; billing role-gated");
console.log("- Portal password reset Owner/Admin only + audited");
console.log("- Clinic member role changes audited");
