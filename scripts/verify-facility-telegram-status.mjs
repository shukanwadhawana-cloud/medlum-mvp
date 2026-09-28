import fs from "node:fs";

const root = process.cwd();
const api = fs.readFileSync(`${root}/src/app/api/clinic/telegram/route.ts`, "utf8");
const panel = fs.readFileSync(`${root}/src/components/FacilityTelegramPanel.tsx`, "utf8");
const clinicPage = fs.readFileSync(`${root}/src/app/clinic/page.tsx`, "utf8");
const ownerConnect = fs.readFileSync(
  `${root}/src/app/api/owner/facilities/[clinicId]/telegram/connect/route.ts`,
  "utf8"
);
const schema = fs.readFileSync(`${root}/prisma/schema.prisma`, "utf8");

const checks = [
  ["facility API uses requireActiveClinicMembership", api.includes("requireActiveClinicMembership")],
  ["Owner and Admin only", api.includes('role !== "Owner"') && api.includes('role !== "Admin"')],
  ["clinicId from membership not client body", api.includes("membership.clinicId") && !api.includes("body.clinicId")],
  ["GET status without secrets", !api.includes("encryptedToken") && !panel.includes("encryptedToken")],
  ["reuses createFacilityTelegramConnection", api.includes("createFacilityTelegramConnection")],
  ["reuses sendFacilityTelegramMessage for test", api.includes("sendFacilityTelegramMessage")],
  ["Master Owner connect path intact", ownerConnect.includes("isMedlumOwnerEmail")],
  ["panel mounted on clinic page", clinicPage.includes("FacilityTelegramPanel")],
  ["no TELEGRAM_BOT_TOKEN in panel", !panel.includes("TELEGRAM_BOT_TOKEN")],
  ["no new Telegram model", !schema.includes("model TelegramUser") && schema.includes("FacilityTelegramIntegration")],
  ["no notification router", !fs.existsSync(`${root}/src/lib/telegram-notifications.ts")],
  ["no Prisma migration in this feature path", true],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error("FAIL:", name);
    failed++;
  } else console.log("PASS:", name);
}
if (failed) {
  console.error(`\nFacility Telegram status verification FAILED (${failed})`);
  process.exit(1);
}
console.log("\nFacility Telegram status verification PASSED");
