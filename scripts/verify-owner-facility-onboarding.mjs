#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const page = read("src/app/owner/hospitals/new/page.tsx");
const provision = read("src/app/api/owner/facilities/route.ts");
const staff = read("src/app/api/clinic/staff/route.ts");
const login = read("src/app/api/auth/login/route.ts");

assert(
  page.includes('field("licenseNumber","License number",false)'),
  "Add Facility must leave licence number optional",
);
assert(
  page.includes('field("registrationNumber","Registration number",form.facilityType === "HOSPITAL")'),
  "Add Facility must require registration number for hospitals",
);
assert(
  page.includes("Enter an email that already has a MedLum account"),
  "UI must clearly explain that facility owner account must pre-exist",
);
assert(
  provision.includes("if (facilityType === \"HOSPITAL\" && !registrationNumber)"),
  "Provisioning API must require hospital registration number",
);
assert(
  !provision.includes("(!licenseNumber || !registrationNumber)"),
  "Provisioning API must not require licence number when registration number is present",
);
assert(
  provision.includes("if (!facilityOwner)"),
  "Provisioning must fail clearly when the facility owner account does not exist",
);
assert(
  provision.includes('role: "Owner", designation: "Facility Owner"'),
  "Provisioning must assign the existing owner account the facility-scoped Owner role",
);
assert(
  provision.includes("if (!doctor || !isMedlumOwnerEmail(doctor.email)) return null"),
  "Only the Enterprise Master Owner may create facilities",
);
assert(
  provision.includes("encryptSecret(telegramToken)"),
  "A supplied facility bot token must be encrypted before storage",
);
assert(
  provision.includes('fetch("https://api.telegram.org/bot" + telegramToken + "/getMe"'),
  "A supplied Telegram bot token must be verified with Telegram before facility creation",
);
assert(
  staff.includes('"Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Pharmacy", "Laboratory", "Billing", "Receptionist", "Staff"'),
  "Staff creation must support expected roles including Admin and Receptionist",
);
assert(
  staff.includes("clinicId: ctx.membership.clinicId") && staff.includes("await writeAudit({"),
  "Staff membership creation must remain facility-scoped and audited",
);
assert(
  login.includes('const roleNeedsOtp =') && login.includes("TELEGRAM_OTP_NOT_CONFIGURED"),
  "Privileged login must retain OTP delivery gate",
);

console.log("Owner facility onboarding contract verified: optional licence, required registration, explicit existing-account prerequisite, facility-scoped Owner membership, encrypted/verified optional bot token, and scoped staff roles.");
