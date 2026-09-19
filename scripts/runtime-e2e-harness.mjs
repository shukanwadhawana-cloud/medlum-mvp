#!/usr/bin/env node
/**
 * Runtime E2E harness for hospital foundation.
 * Requires: DATABASE_URL, SESSION_SECRET, optional APP_URL
 *
 * Modes: --check-env | --dry-run | --seed (needs RUNTIME_E2E_CONFIRM=YES)
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const hasSecret = Boolean(process.env.SESSION_SECRET);
const appUrl = process.env.APP_URL || process.env.MEDLUM_APP_URL || "http://127.0.0.1:3000";
const mode = process.argv.includes("--seed")
  ? "seed"
  : process.argv.includes("--check-env")
    ? "check-env"
    : "dry-run";

const plan = [
  "1. Ensure migrations 20260919180000 + 20260919200000 applied",
  "2. Seed Clinic A (Sanskriti Hospital) + Clinic B",
  "3. Seed roles per clinic",
  "4. Owner login + OTP path",
  "5. Patient + OPD + CBC",
  "6. Tariff CSV import -> activate -> invoice snapshot -> payment -> print",
  "7. Cross-tenant denies A->B",
  "8. Discharge / search / restore",
  "9. Audit verification",
];

console.log("MedLum runtime E2E harness");
console.log("mode:", mode);
console.log("APP_URL:", appUrl);
console.log("DATABASE_URL set:", hasDb);
console.log("SESSION_SECRET set:", hasSecret);
plan.forEach((p) => console.log(p));

if (mode === "check-env") {
  if (!hasDb || !hasSecret) {
    console.error("BLOCKED: set DATABASE_URL and SESSION_SECRET");
    process.exit(2);
  }
  console.log("Environment ready for local runtime tests");
  process.exit(0);
}

if (mode === "seed") {
  if (!hasDb) {
    console.error("BLOCKED BY EXTERNAL ACCESS: DATABASE_URL required");
    process.exit(2);
  }
  if (process.env.RUNTIME_E2E_CONFIRM !== "YES") {
    console.error("Set RUNTIME_E2E_CONFIRM=YES to enable seed writes");
    process.exit(3);
  }
}

console.log("dry-run complete — no data modified");
