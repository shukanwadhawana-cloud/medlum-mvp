import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");

const protectedDoctorRelations = [
  "Patient", "Appointment", "Encounter", "Prescription", "Invoice",
  "Payment", "LabOrder", "PharmacyItem", "Dispensing", "DiagnosticOrder",
  "ClinicMember",
];

const protectedClinicRelations = [
  "ClinicMember", "Patient", "Invoice", "BloodInventory", "BloodDonor",
  "BloodRequest", "InsuranceProvider", "InsurancePolicy", "InsuranceClaim",
];

function relationIsProtected(model, target) {
  const block = schema.match(new RegExp(`model\\s+${model}\\s+\\{([\\s\\S]*?)\\n\\}`, "m"))?.[1] ?? "";
  const relation = block.match(new RegExp(`^\\s*\\w+\\s+${target}\\??\\s+@relation\\([^\\n]*\\)$`, "m"))?.[0];
  return Boolean(relation && /onDelete\s*:\s*Restrict/.test(relation));
}

const failures = [];

for (const model of protectedDoctorRelations) {
  if (!relationIsProtected(model, "Doctor")) failures.push(`${model} -> Doctor must use onDelete:Restrict`);
}

for (const model of protectedClinicRelations) {
  if (!relationIsProtected(model, "Clinic")) failures.push(`${model} -> Clinic must use onDelete:Restrict`);
}

if (/doctor\s+Doctor\??\s+@relation\([^\n]*onDelete\s*:\s*Cascade/.test(schema)) {
  failures.push("No Doctor relation may cascade-delete durable records");
}

if (/clinic\s+Clinic\??\s+@relation\([^\n]*onDelete\s*:\s*Cascade/.test(schema)) {
  failures.push("No Clinic relation may cascade-delete durable records");
}

if (failures.length) {
  console.error("MedLum data-retention protection verification FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MedLum data-retention protection verification passed");
console.log("- Doctor deletion is restricted while dependent records exist");
console.log("- Clinic deletion is restricted while dependent records exist");
console.log("- Historical clinical/operational records cannot be cascade-deleted by parent removal");
