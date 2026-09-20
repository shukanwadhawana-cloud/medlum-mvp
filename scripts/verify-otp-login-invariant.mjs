#!/usr/bin/env node
import fs from "node:fs";

const login = fs.readFileSync("src/app/api/auth/login/route.ts", "utf8");
const otp = fs.readFileSync("src/lib/otp.ts", "utf8");
const verify = fs.readFileSync("src/app/api/auth/otp/verify/route.ts", "utf8");
const loginPage = fs.readFileSync("src/app/login/page.tsx", "utf8");

const checks = [
  ["OTP_REQUIRED includes Owner", /OTP_REQUIRED_ROLES\s*=\s*new Set\(\[[\s\S]*"Owner"/.test(otp)],
  ["roleRequiresOtp used without !isOwner gate", /if\s*\(\s*roleRequiresOtp\s*\(\s*primaryRole\s*\)\s*\)/.test(login)],
  ["login does NOT skip OTP for isOwner", !/if\s*\(\s*!isOwner\s*&&\s*roleRequiresOtp/.test(login)],
  ["login issues OTP before any createSession for privileged", login.indexOf("issueLoginOtp") < login.indexOf("createSession") || login.includes("roleRequiresOtp(primaryRole)")],
  ["otp verify creates session", verify.includes("createSession")],
  ["login page handles requiresOtp", loginPage.includes("requiresOtp")],
  ["login page calls apiVerifyOtp", loginPage.includes("apiVerifyOtp")],
  ["Telegram delivery path", otp.includes("api.telegram.org") && otp.includes("sendTelegramMessage")],
  ["No Gmail in otp.ts", !otp.includes("GMAIL_SMTP") && !otp.includes("nodemailer")],
  ["Production fail-closed without Telegram link", otp.includes("Telegram account is not linked") && otp.includes('NODE_ENV !== "production"')],
  ["no session on OTP issue path", !/issueLoginOtp[\s\S]{0,200}createSession/.test(login)],
  ["devOtp gated off production", otp.includes('NODE_ENV !== "production"') && otp.includes("devCode")],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error("FAIL:", name);
    failed++;
  } else console.log("OK  :", name);
}
if (failed) {
  console.error(`OTP login invariant FAILED (${failed})`);
  process.exit(1);
}
console.log("\nOTP login invariant verification PASSED");
process.exit(0);
