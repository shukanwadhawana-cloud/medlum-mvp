import fs from "node:fs";
import assert from "node:assert/strict";

const clinicAuth = fs.readFileSync("src/lib/clinic-auth.ts", "utf8");
const clinicProducts = fs.readFileSync("src/lib/clinic-products.ts", "utf8");
const patients = fs.readFileSync("src/app/api/patients/route.ts", "utf8");
const owner = fs.readFileSync("src/lib/owner.ts", "utf8");

assert(clinicAuth.includes('import { isMedlumOwnerEmail } from "@/lib/owner";'), "clinic-auth must use server-side owner identity");
assert(clinicAuth.includes("isMedlumOwnerEmail(membership.doctor.email)"), "owner email must resolve to Owner role");
assert(clinicAuth.includes('? "Owner"'), "owner membership must resolve to Owner");
assert(clinicProducts.includes("isMedlumOwnerEmail(membership.doctor.email)"), "owner must bypass clinical subscription module gating");
assert(clinicProducts.includes("allowed: true as const"), "owner module access must be allowed");
assert(patients.includes('membership.role === "Owner"'), "owner patient visibility must bypass OPD/IPD subscriber filtering");
assert(owner.includes("MEDLUM_OWNER_EMAIL"), "owner identity must remain environment-controlled");
assert(owner.includes("shukanwadhawana@gmail.com"), "bootstrap owner identity must remain available");

assert(clinicProducts.includes('setup.subscriptionModel === "BOTH" || setup.subscriptionModel === module'), "non-owner subscription entitlement logic must remain intact");
assert(patients.includes('setup?.subscriptionModel === "OPD"'), "OPD subscription filtering must remain intact");
assert(patients.includes('setup?.subscriptionModel === "IPD"'), "IPD subscription filtering must remain intact");

console.log("Owner full-access regression: PASS");
console.log("- Owner identity is resolved server-side");
console.log("- Owner receives full clinic role permissions");
console.log("- Owner bypasses subscriber-facing OPD/IPD module gating");
console.log("- Owner can see all clinic patients");
console.log("- Non-owner subscription restrictions remain intact");
