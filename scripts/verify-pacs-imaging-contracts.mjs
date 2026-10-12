#!/usr/bin/env node
/**
 * Static contract checks for PACS / ImagingStudy integration.
 * Does not contact production or use patient data.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function mustExist(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) failures.push(`Missing required file: ${rel}`);
  return p;
}

function mustContain(rel, snippets) {
  const p = mustExist(rel);
  if (!p || !fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const s of snippets) {
    if (!text.includes(s)) failures.push(`${rel} missing expected content: ${JSON.stringify(s)}`);
  }
}

mustContain("src/lib/pacs.ts", [
  "getPacsConfig",
  "buildOhifViewerUrl",
  "PACS_ENABLED",
  "StudyInstanceUIDs",
]);

mustContain("src/app/api/imaging-studies/route.ts", [
  "getSession",
  "requireActiveClinicMembership",
  "canEnterDiagnosticReport",
  "ImagingStudy",
  "buildOhifViewerUrl",
  "RBAC_DENIED",
  "PACS_UNAVAILABLE",
]);

mustContain("prisma/migrations/20261012080000_imaging_study/migration.sql", [
  "CREATE TABLE IF NOT EXISTS \"ImagingStudy\"",
  "studyInstanceUid",
  "clinicId",
  "patientId",
]);

mustContain("docs/PACS_INTEGRATION.md", [
  "Orthanc",
  "OHIF",
  "GPLv3",
  "MIT",
  "Vercel",
  "PACS_ENABLED",
]);

mustContain("services/pacs/docker-compose.yml", ["orthanc", "8042"]);

mustContain(".env.example", ["PACS_ENABLED", "PACS_ORTHANC_BASE_URL", "PACS_OHIF_BASE_URL"]);

mustContain("prisma/schema.prisma", ["model ImagingStudy", "studyInstanceUid", "imagingStudies"]);

if (failures.length) {
  console.error("verify-pacs-imaging-contracts FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-pacs-imaging-contracts OK");
