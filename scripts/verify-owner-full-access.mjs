import fs from "node:fs";
import assert from "node:assert/strict";

const clinicAuth = fs.readFileSync("src/lib/clinic-auth.ts", "utf8");
const clinicProducts = fs.readFileSync("src/lib/clinic-products.ts", "utf8");
const patients = fs.readFileSync("src/app/api/patients/route.ts", "utf8");
const owner = fs.readFileSync("src/lib/owner.ts", "utf8");

// Enterprise Master Owner is global (email env) and is intentionally NOT inferred
// as facility Owner from clinic membership. Facility Owner requires membership role.
assert(
  clinicAuth.includes("Enterprise Master Owner") || clinicAuth.includes("facility Owner"),
  "clinic-auth must document enterprise vs facility Owner separation"
);
assert(
  !/isMedlumOwnerEmail\(membership\.doctor\.email\)[\s\S]{0,80}\?\s*"Owner"/.test(clinicAuth),
  "clinic-auth must not elevate facility role to Owner solely from platform owner email"
);
assert(clinicAuth.includes('role === "Owner"'), "facility Owner role checks must remain");

// Platform Master Owner still bypasses clinical module subscription gating
assert(clinicProducts.includes('import { isMedlumOwnerEmail } from "@/lib/owner";'), "clinic-products must use server-side owner identity");
assert(clinicProducts.includes("isMedlumOwnerEmail(membership.doctor.email)"), "owner email must bypass clinical subscription module gating");
assert(clinicProducts.includes("allowed: true as const"), "owner module access must be allowed");

// Facility Owner membership still sees all clinic patients (subscription filter bypass)
assert(patients.includes('membership.role === "Owner"'), "owner patient visibility must bypass OPD/IPD subscriber filtering");
assert(patients.includes('setup?.subscriptionModel === "OPD"'), "OPD subscription filtering must remain intact");
assert(patients.includes('setup?.subscriptionModel === "IPD"'), "IPD subscription filtering must remain intact");

assert(owner.includes("MEDLUM_OWNER_EMAIL"), "owner identity must remain environment-controlled");
assert(owner.includes("shukanwadhawana@gmail.com"), "bootstrap owner identity must remain available");

assert(
  clinicProducts.includes('setup.subscriptionModel === "BOTH" || setup.subscriptionModel === module') ||
    clinicProducts.includes("clinicHasModule"),
  "non-owner subscription entitlement logic must remain intact"
);

console.log("Owner full-access regression: PASS");
console.log("- Enterprise Master Owner is global and not auto-mapped to facility Owner");
console.log("- Facility Owner remains membership-role based");
console.log("- Platform owner still bypasses subscriber module gating");
console.log("- Facility Owner patient visibility and subscription filters remain intact");
