#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
function assert(c, m) { if (!c) throw new Error(m); }

const schema = read("prisma/schema.prisma");
assert(schema.includes("model OtpChallenge"), "OtpChallenge model");
assert(schema.includes("model TariffVersion"), "TariffVersion model");
assert(schema.includes("model LabTemplate"), "LabTemplate model");
assert(schema.includes("deletedAt"), "Patient soft-delete field");

const otp = read("src/lib/otp.ts");
assert(otp.includes("issueLoginOtp") && otp.includes("consumeLoginOtp"), "OTP helpers");

const login = read("src/app/api/auth/login/route.ts");
assert(login.includes("requiresOtp") && login.includes("issueLoginOtp"), "login issues OTP");

const verify = read("src/app/api/auth/otp/verify/route.ts");
assert(verify.includes("consumeLoginOtp") && verify.includes("createSession"), "OTP verify");

const workflow = read("src/lib/workflow.ts");
assert(workflow.includes("Pharmacy") && workflow.includes("Laboratory"), "expanded roles");

const lifecycle = read("src/app/api/patients/lifecycle/route.ts");
assert(lifecycle.includes("discharge") && lifecycle.includes("soft-delete"), "lifecycle");

console.log("Hospital foundation verification PASSED");
