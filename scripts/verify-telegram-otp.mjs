#!/usr/bin/env node
import fs from "node:fs";

const otp = fs.readFileSync("src/lib/otp.ts", "utf8");
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const webhook = fs.readFileSync("src/app/api/telegram/webhook/route.ts", "utf8");
const link = fs.readFileSync("src/app/api/auth/telegram/link/route.ts", "utf8");
const login = fs.readFileSync("src/app/api/auth/login/route.ts", "utf8");
const migration = fs.readFileSync("prisma/migrations/20260920130000_telegram_otp/migration.sql", "utf8");

const checks = [
  ["Telegram delivery", otp.includes("api.telegram.org") && otp.includes("sendMessage")],
  ["No Gmail dependency", !otp.includes("GMAIL_SMTP") && !pkg.dependencies?.nodemailer && !pkg.devDependencies?.["@types/nodemailer"]],
  ["No nodemailer package", !JSON.stringify(pkg).includes("nodemailer")],
  ["Telegram identity model", schema.includes("model TelegramIdentity") && schema.includes("telegramChatId")],
  ["Link challenge model", schema.includes("model TelegramLinkChallenge") && schema.includes("tokenHash")],
  ["OTP remains hashed", otp.includes("bcrypt.hash") && otp.includes("bcrypt.compare")],
  ["Production fail-closed", otp.includes("Telegram account is not linked")],
  ["Webhook secret required", webhook.includes("x-telegram-bot-api-secret-token") && webhook.includes("TELEGRAM_WEBHOOK_SECRET")],
  ["Link token hashed", otp.includes("hashLinkToken") || otp.includes("sha256")],
  ["Link restricted to privileged", link.includes("roleRequiresOtp") || link.includes("isMedlumOwnerEmail")],
  ["Login uses Telegram path", login.includes("issueLoginOtp") && login.includes("roleRequiresOtp")],
  ["Migration present", migration.includes("TelegramIdentity") && migration.includes("TelegramLinkChallenge")],
  ["Unlink supported", link.includes("export async function DELETE")],
  ["Status GET supported", link.includes("export async function GET")],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error("FAIL:", name);
    failed++;
  } else console.log("PASS:", name);
}
if (failed) process.exit(1);
console.log("\nTelegram OTP verification PASSED");
