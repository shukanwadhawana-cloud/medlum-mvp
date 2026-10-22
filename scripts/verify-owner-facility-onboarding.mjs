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
const telegramPrelink = read("src/app/api/auth/telegram/prelink/route.ts");

assert(
  page.includes('field("licenseNumber","License number",false)'),
  "Add Facility must leave licence number optional",
);
assert(
  page.includes('field("registrationNumber","Registration number",form.facilityType === "HOSPITAL")'),
  "Add Facility must require registration number for hospitals",
);
assert(
  page.includes("Use the hospital owner’s Gmail address for their MedLum login"),
  "UI must permit the hospital's own Gmail as owner login and explain first-time setup",
);
assert(
  page.includes("Copy owner setup link") && page.includes("link privately"),
  "UI must let the Master Owner securely share the one-time owner password setup link",
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
  provision.includes('passwordHash: temporaryPasswordHash') &&
    provision.includes('purpose: "password_reset_link"') &&
    provision.includes("createdOwnerAccount"),
  "Provisioning must create a first-time owner account with a hashed temporary password and a one-time reset-link challenge",
);
assert(
  provision.includes('setupLink: setupUrl.toString()') &&
    provision.includes('setupUrl.hash = "token="'),
  "Provisioning must return the one-time setup token in the URL fragment, not the query string",
);
assert(
  provision.includes('action: "FACILITY_OWNER_ACCOUNT_CREATED"'),
  "First-time facility owner account creation must be audited",
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
assert(
  page.includes("MedLum Staff ID or Gmail") &&
    telegramPrelink.includes("loginIdentifier.includes(\"@\")") &&
    telegramPrelink.includes("where: { email: loginIdentifier.toLowerCase() }"),
  "A first-time owner must be able to use their Gmail to link Telegram before the first privileged login",
);

console.log("Owner facility onboarding contract verified: optional licence, required registration, first-time owner account setup link, facility-scoped Owner membership, encrypted/verified optional bot token, and scoped staff roles.");
