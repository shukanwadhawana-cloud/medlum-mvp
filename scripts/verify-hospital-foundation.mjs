#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
function assert(c, m) { if (!c) throw new Error(m); }
/** Collapse whitespace so Prisma field alignment padding does not break checks. */
function hasSchema(fragment) {
  const norm = (s) => s.replace(/\s+/g, " ");
  return norm(read("prisma/schema.prisma")).includes(norm(fragment));
}

assert(hasSchema("model OtpChallenge"), "OtpChallenge model");
assert(hasSchema("model TariffVersion"), "TariffVersion model");
assert(hasSchema("model LabTemplate"), "LabTemplate model");
assert(hasSchema("deletedAt"), "Patient soft-delete field");
assert(hasSchema("registrationNo"), "Patient registrationNo");
assert(hasSchema('status String @default("ACTIVE")'), "Patient status field");

const otp = read("src/lib/otp.ts");
assert(otp.includes("issueLoginOtp") && otp.includes("consumeLoginOtp"), "OTP helpers");

const login = read("src/app/api/auth/login/route.ts");
assert(login.includes("requiresOtp") && login.includes("issueLoginOtp"), "login issues OTP");

const verifyPath = "src/app/api/auth/otp/verify/route.ts";
assert(fs.existsSync(path.join(root, verifyPath)), "OTP verify route exists");
const verify = read(verifyPath);
assert(verify.includes("consumeLoginOtp") && verify.includes("createSession"), "OTP verify");

const workflow = read("src/lib/workflow.ts");
assert(workflow.includes("Pharmacy") && workflow.includes("Laboratory"), "expanded roles");

const lifecycle = read("src/app/api/patients/lifecycle/route.ts");
assert(lifecycle.includes("discharge") && lifecycle.includes("soft-delete"), "lifecycle");

const lab = read("src/app/api/lab-templates/route.ts");
assert(lab.includes("CBC") && lab.includes("ensureSystemCbcTemplate"), "lab CBC template API");

const migration = path.join(root, "prisma/migrations/20260919180000_hospital_foundation_otp_tariff_lab/migration.sql");
assert(fs.existsSync(migration), "foundation migration SQL exists");

console.log("Hospital foundation verification PASSED");
