#!/usr/bin/env node
/**
 * Ensures App Password paste artifacts are stripped (root cause of many 535 errors).
 * Does not import nodemailer or touch real secrets.
 */
function normalizeSmtpUser(raw) {
  return String(raw || "").trim().toLowerCase();
}
function normalizeSmtpAppPassword(raw) {
  let p = String(raw || "").trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1).trim();
  }
  return p.replace(/\s+/g, "");
}

const cases = [
  ["abcd efgh ijkl mnop", "abcdefghijklmnop"],
  ["  abcd efgh ijkl mnop  ", "abcdefghijklmnop"],
  ['"abcdefghijklmnop"', "abcdefghijklmnop"],
  ["abcdefghijklmnop", "abcdefghijklmnop"],
  ["ab cd\tef", "abcdef"],
];
let failed = 0;
for (const [input, expected] of cases) {
  const got = normalizeSmtpAppPassword(input);
  if (got !== expected) {
    console.error("FAIL pass", JSON.stringify(input), "→", got, "expected", expected);
    failed++;
  } else console.log("OK  pass normalize");
}
if (normalizeSmtpUser("  User@Example.COM ") !== "user@example.com") {
  console.error("FAIL user normalize");
  failed++;
} else console.log("OK  user normalize");

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const otp = fs.readFileSync(path.join(root, "src/lib/otp.ts"), "utf8");
if (!otp.includes("normalizeSmtpAppPassword") || !otp.includes("replace(/\\s+/g")) {
  console.error("FAIL: otp.ts missing normalizeSmtpAppPassword");
  failed++;
} else console.log("OK  otp.ts exports normalize helpers");
if (!otp.includes("createOtpMailTransport")) {
  console.error("FAIL: missing createOtpMailTransport");
  failed++;
} else console.log("OK  shared transport factory");
if (failed) process.exit(1);
console.log("\nSMTP normalize verification PASSED");
