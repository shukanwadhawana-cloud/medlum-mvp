import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const overview = readFileSync("src/app/api/owner/overview/route.ts", "utf8");
const route = readFileSync("src/app/api/owner/facilities/[id]/route.ts", "utf8");
const ui = readFileSync("src/app/owner/hospitals/page.tsx", "utf8");
const migration = readFileSync("prisma/migrations/20261002130000_facility_lifecycle/migration.sql", "utf8");

const failures = [];
const clinic = schema.match(/model\s+Clinic\s+\{([\s\S]*?)\n\}/m)?.[1] ?? "";

for (const field of [
  'facilityStatus     String                 @default("ACTIVE")',
  'statusReason       String                 @default("")',
  'statusNote         String                 @default("")',
  'statusUpdatedAt    DateTime?',
  'statusUpdatedBy    String?',
]) if (!clinic.includes(field)) failures.push("Clinic missing lifecycle field: " + field);

for (const status of ["ACTIVE", "GRACE_PERIOD", "SUSPENDED", "LICENSE_EXPIRED", "COMPLIANCE_HOLD", "FRAUD_HOLD", "DEACTIVATED"]) {
  if (!route.includes('"' + status + '"')) failures.push("Owner facility API missing status " + status);
}
for (const marker of ["isMedlumOwnerEmail", "FACILITY_STATUS_CHANGED", "FACILITY_REACTIVATED", "FACILITY_DELETED", "confirmName", "clinical, billing, workforce, compliance"]) {
  if (!route.includes(marker)) failures.push("Owner facility API missing safety marker: " + marker);
}
if (!route.includes("clinicMember.count") || !route.includes("patient.count") || !route.includes("invoice.count")) failures.push("Deletion preflight must inspect retained data");
if (!route.includes("clinicMember.deleteMany") || !route.includes('clinic.delete({ where: { id } })')) failures.push("Deletion must remove memberships before deleting an empty facility");
if (!overview.includes("clinics.filter((c) => c.isActive).length")) failures.push("Owner overview must count only active facilities as active");
if (!overview.includes("facilityStatus")) failures.push("Owner overview must expose facility lifecycle status");
if (!ui.includes("/api/owner/facilities/") || !ui.includes("Delete test facility") || !ui.includes("Suspend access")) failures.push("Owner UI missing lifecycle controls");
if (!migration.includes('ADD COLUMN IF NOT EXISTS "facilityStatus"')) failures.push("Lifecycle migration missing facilityStatus");

if (failures.length) {
  console.error("Facility lifecycle verification FAILED");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("Facility lifecycle verification passed");
