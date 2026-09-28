#!/usr/bin/env node
/**
 * Static multi-tenant / US-readiness verifier.
 * Does not claim HIPAA compliance — checks architectural readiness signals only.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const locale = read("src/lib/locale.ts");
const time = read("src/lib/time.ts");
const phone = read("src/lib/phone.ts");
const clinicAuth = read("src/lib/clinic-auth.ts");
const owner = read("src/lib/owner.ts");
const otp = read("src/lib/otp.ts");
const chatwoot = read("src/lib/chatwoot.ts");
const schema = read("prisma/schema.prisma");

const apiSamples = [
  "src/app/api/patients/route.ts",
  "src/app/api/appointments/route.ts",
  "src/app/api/telemedicine/sessions/route.ts",
  "src/app/api/clinic/telegram/route.ts",
  "src/app/api/chatwoot/route.ts",
].filter(exists).map((p) => ({ path: p, src: read(p) }));

const checks = [];
const add = (name, ok, detail = "") => checks.push({ name, ok, detail });

// Locale / timezone / currency abstraction
add("locale module exists", exists("src/lib/locale.ts"));
add("platform timezone env override", locale.includes("MEDLUM_DEFAULT_TIMEZONE"));
add("platform currency env override", locale.includes("MEDLUM_DEFAULT_CURRENCY"));
add("formatMoney helper", locale.includes("formatMoney"));
add("time uses locale timezone", time.includes("getClinicalTimezone") || time.includes("getPlatformLocaleConfig"));
add("formatIst retained for compatibility", time.includes("export function formatIst"));
add("India default preserved", locale.includes("Asia/Kolkata") && locale.includes("INR"));

// Phone international readiness
add("phone keeps international digits path", phone.includes("digits.length > 11") || phone.includes("international"));
add("phone India path retained", phone.includes("91") || phone.includes("+91"));

// Tenancy primitives
add("requireActiveClinicMembership exists", clinicAuth.includes("requireActiveClinicMembership"));
add("findAuthorizedPatient exists", clinicAuth.includes("findAuthorizedPatient"));
add("Master Owner email allowlist", owner.includes("isMedlumOwnerEmail") && owner.includes("MEDLUM_OWNER_EMAIL"));

// Sample APIs use membership
for (const { path: p, src } of apiSamples) {
  add(`${p} uses session/membership gate`, src.includes("getSession") || src.includes("requireActiveClinicMembership") || src.includes("requirePrivilegedSession") || src.includes("isMedlumOwnerEmail"));
}

const tele = apiSamples.find((a) => a.path.includes("telemedicine"));
if (tele) {
  add("telemedicine does not trust client clinicId", tele.src.includes("Never trust client clinicId") || tele.src.includes("never trust"));
}

const clinicTg = apiSamples.find((a) => a.path.includes("clinic/telegram"));
if (clinicTg) {
  add("facility telegram clinicId from membership", clinicTg.src.includes("membership.clinicId"));
  add("facility telegram Owner/Admin only", clinicTg.src.includes("Owner") && clinicTg.src.includes("Admin"));
}

// Chatwoot server-only
add("chatwoot server-only", chatwoot.includes("server-only") || chatwoot.includes("CHATWOOT_API_TOKEN"));

// Telegram offboarding
add("telegram delivery gate", otp.includes("assertTelegramAuthDeliveryAllowed"));

// No parallel clinical architecture
add("no USPatient model", !schema.includes("model USPatient"));
add("no USEncounter model", !schema.includes("model USEncounter"));
add("single Patient model", schema.includes("model Patient"));
add("single ClinicMember model", schema.includes("model ClinicMember"));
add("FacilityTelegramIntegration retained", schema.includes("model FacilityTelegramIntegration"));

// No notification router / duplicate systems in this milestone
add("no telegram-notifications module", !exists("src/lib/telegram-notifications.ts"));

let failed = 0;
for (const c of checks) {
  if (!c.ok) {
    console.error("FAIL:", c.name, c.detail || "");
    failed++;
  } else {
    console.log("PASS:", c.name);
  }
}

if (failed) {
  console.error(`\nUS readiness verification FAILED (${failed}/${checks.length})`);
  process.exit(1);
}
console.log(`\nUS readiness verification PASSED (${checks.length} checks)`);
console.log("Note: This does NOT certify HIPAA/FDA compliance.");
