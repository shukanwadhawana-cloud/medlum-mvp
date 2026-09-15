#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
function assert(c, m) { if (!c) throw new Error(m); }
const clinicAuth = read("src/lib/clinic-auth.ts");
const patientDetail = read("src/app/api/patients/[id]/route.ts");
const patientList = read("src/app/api/patients/route.ts");
const portalReset = read("src/app/api/portal/auth/reset/route.ts");
const clinicRoute = read("src/app/api/clinic/route.ts");
assert(clinicAuth.includes("requireActiveClinicMembership"), "membership helper");
assert(clinicAuth.includes("canResetPortalPassword"), "portal helper");
assert(clinicAuth.includes('role === "Owner" || role === "Admin"'), "Owner/Admin only reset");
assert(patientDetail.includes("findAuthorizedPatient"), "patient authorize");
assert(patientDetail.includes("requireActiveClinicMembership"), "detail membership");
assert(patientList.includes("requireActiveClinicMembership"), "list membership");
assert(portalReset.includes("canResetPortalPassword"), "reset helper");
assert(!portalReset.includes('"Consultant"'), "no Consultant reset");
assert(portalReset.includes("PORTAL_PASSWORD_RESET"), "audit");
assert(clinicRoute.includes("CLINIC_MEMBER_ROLE_CHANGED"), "role audit");
console.log("P1 authorization verification PASSED");
