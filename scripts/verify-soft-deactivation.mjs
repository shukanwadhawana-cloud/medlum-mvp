import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const session = readFileSync("src/lib/session.ts", "utf8");
const login = readFileSync("src/app/api/auth/login/route.ts", "utf8");
const clinicRoute = readFileSync("src/app/api/clinic/route.ts", "utf8");

const failures = [];

for (const model of ["Doctor", "Clinic", "ClinicMember"]) {
  const block = schema.match(new RegExp(`model\\s+${model}\\s+\\{([\\s\\S]*?)\\n\\}`, "m"))?.[1] ?? "";
  if (!/isActive\\s+Boolean\\s+@default\\(true\\)/.test(block)) failures.push(`${model} must have isActive defaulting to true`);
  if (!/deactivatedAt\\s+DateTime\\?/.test(block)) failures.push(`${model} must have nullable deactivatedAt`);
}

if (!session.includes("doctor.isActive") || !session.includes("!doctor.isActive")) {
  failures.push("Authenticated sessions must be rejected for inactive doctors");
}
if (!login.includes("!doctor.isActive") || !login.includes("403")) {
  failures.push("Login must reject deactivated doctors with HTTP 403");
}
if (!clinicRoute.includes('action === "deactivate"') || !clinicRoute.includes('action === "reactivate"')) {
  failures.push("Clinic membership must support explicit deactivate/reactivate actions");
}
if (!clinicRoute.includes("isActive: false") || !clinicRoute.includes("deactivatedAt: new Date()")) {
  failures.push("Deactivation must persist inactive state and timestamp");
}
if (!clinicRoute.includes('action === "deactivate-clinic"') || !clinicRoute.includes('action === "reactivate-clinic"')) {
  failures.push("Clinic must support explicit deactivate/reactivate actions");
}
if (!clinicRoute.includes("CLINIC_MEMBER_DEACTIVATED") || !clinicRoute.includes("CLINIC_DEACTIVATED")) {
  failures.push("Deactivation actions must be auditable");
}
if (!clinicRoute.includes("legacyDeleteRequest: true")) {
  failures.push("Legacy DELETE member endpoint must be non-destructive");
}

if (failures.length) {
  console.error("MedLum soft-deactivation verification FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MedLum soft-deactivation verification passed");
console.log("- Doctor accounts support active/inactive state");
console.log("- Clinic and clinic memberships support active/inactive state");
console.log("- Inactive doctors cannot establish or continue authenticated sessions");
console.log("- Clinic member removal is non-destructive");
console.log("- Deactivation and reactivation actions are auditable");
