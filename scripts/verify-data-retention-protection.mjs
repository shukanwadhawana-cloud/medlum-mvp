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

/** Ephemeral / config models may cascade when parent is removed (not durable PHI). */
const ALLOWED_CASCADE_MODELS = new Set([
  "OtpChallenge",
  "LabTemplate",
  "LabTemplateParameter",
  "TariffItem", // child of TariffVersion; version itself is Restrict on Clinic
  // Telegram link state is ephemeral account-binding, not durable clinical PHI
  "TelegramIdentity",
  "TelegramLinkChallenge",
  // ABDM integration state is clinic-scoped; migration uses CASCADE (non-PHI operational records)
  "AbdmConsent",
  "AbdmCareContext",
  "AbdmEvent",
]);

function relationIsProtected(model, target) {
  const block = schema.match(new RegExp(`model\\s+${model}\\s+\\{([\\s\\S]*?)\\n\\}`, "m"))?.[1] ?? "";
  const relation = block.match(new RegExp(`^\\s*\\w+\\s+${target}\\??\\s+@relation\\([^\\n]*\\)$`, "m"))?.[0];
  return Boolean(relation && /onDelete\s*:\s*Restrict/.test(relation));
}

function cascadeRelationsTo(target) {
  // Find model blocks that contain relation to target with Cascade
  const results = [];
  const modelRe = /model\s+(\w+)\s+\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = modelRe.exec(schema)) !== null) {
    const modelName = m[1];
    const body = m[2];
    const relRe = new RegExp(
      `\\w+\\s+${target}\\??\\s+@relation\\([^\\n]*onDelete\\s*:\\s*Cascade[^\\n]*\\)`,
      "g"
    );
    if (relRe.test(body)) results.push(modelName);
  }
  return results;
}

const failures = [];

for (const model of protectedDoctorRelations) {
  if (!relationIsProtected(model, "Doctor")) failures.push(`${model} -> Doctor must use onDelete:Restrict`);
}

for (const model of protectedClinicRelations) {
  if (!relationIsProtected(model, "Clinic")) failures.push(`${model} -> Clinic must use onDelete:Restrict`);
}

for (const model of cascadeRelationsTo("Doctor")) {
  if (!ALLOWED_CASCADE_MODELS.has(model)) {
    failures.push(`No Doctor relation may cascade-delete durable records (found Cascade on ${model})`);
  }
}

for (const model of cascadeRelationsTo("Clinic")) {
  if (!ALLOWED_CASCADE_MODELS.has(model)) {
    failures.push(`No Clinic relation may cascade-delete durable records (found Cascade on ${model})`);
  }
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
console.log("- Ephemeral models (OtpChallenge, lab/tariff config children) may cascade");
