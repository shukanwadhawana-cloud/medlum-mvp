import fs from "node:fs";

const root = process.cwd();
const otp = fs.readFileSync(`${root}/src/lib/otp.ts`, "utf8");
const webhook = fs.readFileSync(`${root}/src/app/api/telegram/webhook/route.ts`, "utf8");
const link = fs.readFileSync(`${root}/src/app/api/auth/telegram/link/route.ts`, "utf8");
const schema = fs.readFileSync(`${root}/prisma/schema.prisma`, "utf8");

const checks = [
  ["delivery gate helper exists", otp.includes("assertTelegramAuthDeliveryAllowed")],
  ["issueLoginOtp calls delivery gate", otp.includes("assertTelegramAuthDeliveryAllowed(params.doctorId)")],
  ["inactive doctor fails closed before send", otp.includes("DOCTOR_INACTIVE") || otp.includes("deactivated or no longer authorized")],
  ["active membership required for non-owners", otp.includes("NO_ACTIVE_MEMBERSHIP") || otp.includes("clinicMemberships")],
  ["platform owner path retained", otp.includes("isMedlumOwnerEmail")],
  ["TelegramIdentity model retained", schema.includes("model TelegramIdentity")],
  ["LinkChallenge hashed+expiry retained", schema.includes("tokenHash") && schema.includes("consumedAt")],
  ["webhook secret validation retained", webhook.includes("TELEGRAM_WEBHOOK_SECRET") && webhook.includes("x-telegram-bot-api-secret-token")],
  ["webhook refuses inactive doctor link", webhook.includes("isActive") && webhook.includes("no longer active")],
  ["link route requires active doctor", link.includes("isActive") && link.includes("Account unavailable")],
  ["link route requires active membership for non-owners", link.includes("No active facility membership") || link.includes("isActive: true")],
  ["no new TelegramUser model", !schema.includes("model TelegramUser")],
  ["bot token not in client components", !fs.readFileSync(`${root}/src/components/MedLumChat.tsx`, "utf8").includes("TELEGRAM_BOT_TOKEN")],
  ["credentials server-side in otp", otp.includes("process.env.TELEGRAM_BOT_TOKEN")],
  ["no notification routing system added", !otp.includes("appointment notification") && !fs.existsSync(`${root}/src/lib/telegram-notifications.ts")],
  ["canonical origin helper retained", otp.includes("getCanonicalAppOrigin")],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error("FAIL:", name);
    failed++;
  } else console.log("PASS:", name);
}
if (failed) {
  console.error(`\nTelegram offboarding verification FAILED (${failed})`);
  process.exit(1);
}
console.log("\nTelegram offboarding verification PASSED");
