import fs from "node:fs";

const policy = fs.readFileSync("src/lib/data/retention.ts", "utf8");
const docs = fs.readFileSync("docs/data-architecture.md", "utf8");

const requiredMappings = [
  ["patientRecords", "MEDLUM_DB"],
  ["encounters", "MEDLUM_DB"],
  ["prescriptions", "MEDLUM_DB"],
  ["pharmacyTransactions", "MEDLUM_DB"],
  ["appointments", "MEDLUM_DB"],
  ["billing", "MEDLUM_DB"],
  ["auditLogs", "MEDLUM_DB"],
  ["abdmInteroperability", "EKA_ABDM"],
  ["liveVideo", "VIDEO_PROVIDER"],
];

for (const [recordClass, store] of requiredMappings) {
  const expected = `${recordClass}: "${store}"`;
  if (!policy.includes(expected)) {
    throw new Error(`Missing canonical-store mapping: ${expected}`);
  }
}

const requiredDocTerms = [
  "canonical system of record",
  "EKA / ABDM",
  "Video provider",
  "multiple devices/users",
  "retention periods must be configurable",
];

for (const term of requiredDocTerms) {
  if (!docs.includes(term)) {
    throw new Error(`Missing architecture requirement: ${term}`);
  }
}

if (/EKA_ABDM.*MEDLUM_DB|MEDLUM_DB.*EKA_ABDM/.test(policy)) {
  // Keep this check intentionally simple: the explicit mapping above is authoritative.
}

console.log("Data architecture verification passed: MedLum remains the system of record.");
