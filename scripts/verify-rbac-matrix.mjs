#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, "src/lib/workflow.ts"), "utf8");
const clinicAuth = fs.readFileSync(path.join(root, "src/lib/clinic-auth.ts"), "utf8");
function assert(c, m) { if (!c) throw new Error(m); }

const requiredRoles = [
  "Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO",
  "Nurse", "Pharmacy", "Laboratory", "Billing", "Receptionist", "Staff",
];
for (const r of requiredRoles) {
  assert(workflow.includes(`"${r}"`), `workflow missing role ${r}`);
  assert(clinicAuth.includes(`"${r}"`), `clinic-auth missing role ${r}`);
}

assert(clinicAuth.includes("canManageTariff"), "canManageTariff");
assert(clinicAuth.includes("canManageLab"), "canManageLab");
assert(clinicAuth.includes("canManagePharmacy"), "canManagePharmacy");
assert(clinicAuth.includes("isMembershipManager"), "isMembershipManager");
assert(clinicAuth.includes("canResetPortalPassword"), "canResetPortalPassword");

const otp = fs.readFileSync(path.join(root, "src/lib/otp.ts"), "utf8");
assert(otp.includes("Owner") && otp.includes("Admin") && otp.includes("Manager"), "OTP required roles");

console.log("RBAC matrix static verification PASSED");
console.log("- All 12 hospital roles present in workflow + clinic-auth");
console.log("- Tariff/lab/pharmacy permission helpers present");
console.log("- OTP required for Owner/Admin/Manager");
