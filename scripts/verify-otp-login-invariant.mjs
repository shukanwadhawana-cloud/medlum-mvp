#!/usr/bin/env node
/**
 * Static invariant: privileged roles must not receive createSession in login route
 * before OTP verification. Platform owners are OTP-required (primaryRole = Owner).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const login = fs.readFileSync(path.join(root, "src/app/api/auth/login/route.ts"), "utf8");
const otp = fs.readFileSync(path.join(root, "src/lib/otp.ts"), "utf8");
const verify = fs.readFileSync(path.join(root, "src/app/api/auth/otp/verify/route.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "src/app/login/page.tsx"), "utf8");

const checks = [
  ["OTP_REQUIRED includes Owner", otp.includes('"Owner"') && otp.includes("OTP_REQUIRED_ROLES")],
  ["roleRequiresOtp used without !isOwner gate", /if\s*\(\s*roleRequiresOtp\s*\(\s*primaryRole\s*\)\s*\)/.test(login)],
  ["login does NOT skip OTP for isOwner", !/if\s*\(\s*!isOwner\s*&&\s*roleRequiresOtp/.test(login)],
  ["login issues OTP before any createSession for privileged", login.indexOf("issueLoginOtp") < login.indexOf("await createSession")],
  ["otp verify creates session", verify.includes("createSession")],
  ["login page handles requiresOtp", page.includes("requiresOtp") && page.includes("setOtpStep")],
  ["login page calls apiVerifyOtp", page.includes("apiVerifyOtp")],
  ["production Gmail fail-closed", otp.includes("Gmail OTP delivery failed") && otp.includes('NODE_ENV === "production"')],
  ["no session on OTP issue path", login.includes("requiresOtp: true") && login.includes("challengeId")],
  ["devOtp gated off production in issueLoginOtp", otp.includes('NODE_ENV !== "production"') && otp.includes("devCode")],
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
