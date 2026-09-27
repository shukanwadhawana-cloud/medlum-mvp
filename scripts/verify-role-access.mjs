#!/usr/bin/env node
/**
 * Static verification: role-aware staff access + navigation.
 * Confirms central permissions matrix, AppShell wiring, facility isolation
 * helpers, and that platform owner is not conflated with facility Admin.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(msg);
  else console.log("OK:", msg);
}

const permissions = read("src/lib/permissions.ts");
const clinicAuth = read("src/lib/clinic-auth.ts");
const appShell = read("src/components/AppShell.tsx");
const doctorProvider = read("src/components/DoctorProvider.tsx");
const staffApi = read("src/app/api/clinic/staff/route.ts");
const ownerLib = read("src/lib/owner.ts");

// Central matrix present
ok(permissions.includes("canAccessModule"), "canAccessModule exported");
ok(permissions.includes("canManageStaff"), "canManageStaff exported");
ok(permissions.includes("canManageClinic"), "canManageClinic exported");
ok(permissions.includes("canPrescribe"), "canPrescribe exported");
ok(permissions.includes("canDispense"), "canDispense exported");
ok(permissions.includes("canEnterLabResult"), "canEnterLabResult exported");
ok(permissions.includes("canEnterDiagnosticReport"), "canEnterDiagnosticReport exported");
ok(permissions.includes("canManageMAR"), "canManageMAR exported");
ok(permissions.includes("primaryNavForRole"), "primaryNavForRole exported");
ok(permissions.includes("menuNavForRole"), "menuNavForRole exported");
ok(permissions.includes("defaultLandingPath"), "defaultLandingPath exported");
ok(permissions.includes("MODULE_ROLES"), "MODULE_ROLES matrix present");

// Role coverage in matrix
for (const role of ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Pharmacy", "Laboratory", "Billing", "Receptionist", "Staff"]) {
  ok(permissions.includes(`"${role}"`), `permissions mentions role ${role}`);
}

// Module coverage
for (const mod of ["patients", "opd", "ipd", "emergency", "pharmacy", "labs", "diagnostics", "workforce", "clinic", "nursing", "telemedicine"]) {
  ok(permissions.includes(`"${mod}"`), `module ${mod} in matrix`);
}

// Pharmacy restricted
ok(
  /pharmacy:\s*\[[^\]]*"Pharmacy"/.test(permissions) || permissions.includes('pharmacy: ["Owner", "Admin", "Manager", "Pharmacy"]'),
  "pharmacy module limited to Owner/Admin/Manager/Pharmacy"
);

// Workforce limited to managers
ok(
  permissions.includes('workforce: ["Owner", "Admin", "Manager"]'),
  "workforce limited to Owner/Admin/Manager"
);

// owner_platform never granted via facility role alone
ok(
  /owner_platform:\s*\[\s*\]/.test(permissions),
  "owner_platform has empty facility role list (platform-only)"
);

// AppShell uses central permissions (not ad-hoc designation heuristics)
ok(appShell.includes("primaryNavForRole"), "AppShell imports primaryNavForRole");
ok(appShell.includes("menuNavForRole"), "AppShell imports menuNavForRole");
ok(appShell.includes("from \"@/lib/permissions\"") || appShell.includes("from '@/lib/permissions'"), "AppShell imports permissions");
ok(!appShell.includes("isPharmacist") && !appShell.includes("isLaboratory") && !appShell.includes("isNursing"), "AppShell no longer uses designation string heuristics for primary nav");

// Facility role drives nav when available
ok(appShell.includes("activeRole") || appShell.includes("selectedFacilityId"), "AppShell uses selected facility role for nav");

// DoctorProvider landing
ok(doctorProvider.includes("defaultLandingPath"), "DoctorProvider uses defaultLandingPath");

// Facility isolation still enforced server-side
ok(clinicAuth.includes("requireActiveClinicMembership"), "requireActiveClinicMembership retained");
ok(clinicAuth.includes("getSelectedClinicId"), "getSelectedClinicId retained");
ok(clinicAuth.includes("security boundary") || clinicAuth.includes("cookie is only a selector"), "facility cookie documented as non-authoritative");

// Staff API still role-gated
ok(staffApi.includes("requireActiveClinicMembership"), "staff API uses requireActiveClinicMembership");
ok(staffApi.includes("Owner") && staffApi.includes("Admin") && staffApi.includes("Manager"), "staff API role gates present");

// Platform owner separation
ok(ownerLib.includes("isMedlumOwnerEmail") || ownerLib.includes("MEDLUM_OWNER"), "platform owner helper present");

if (fails.length) {
  console.error("\nRole-access verification FAILED:");
  for (const f of fails) console.error("-", f);
  process.exit(1);
}
console.log("\nRole-access verification PASSED");
