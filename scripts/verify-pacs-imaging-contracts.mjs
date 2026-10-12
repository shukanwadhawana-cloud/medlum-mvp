#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const failures = [];
function mustContain(rel, snippets) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    failures.push(`Missing: ${rel}`);
    return;
  }
  const text = fs.readFileSync(p, "utf8");
  for (const s of snippets) {
    if (!text.includes(s)) failures.push(`${rel} missing: ${JSON.stringify(s)}`);
  }
}
mustContain("src/lib/pacs.ts", ["getPacsConfig", "buildOhifViewerUrl", "PACS_ENABLED", "uid.length > 64", "These query parameters do not configure a datasource", 'process.env.NODE_ENV !== "production"', 'u.protocol === "https:"']);
const pacsSource = fs.readFileSync(path.join(root, "src/lib/pacs.ts"), "utf8");
if (pacsSource.includes('url.searchParams.set("dicomwebRoot"') || pacsSource.includes('url.searchParams.set("datasources"')) {
  failures.push("OHIF URL must not pretend query params configure DICOMweb datasource");
}
mustContain("src/app/api/imaging-studies/route.ts", [
  "getSession",
  "requireActiveClinicMembership",
  "canEnterDiagnosticReport",
  "ImagingStudy",
  "RBAC_DENIED",
  "PACS_UNAVAILABLE",
  "const status = \"PENDING\";",
  "uid.length > 64",
  "Never accept an Orthanc object ID from the browser",
  'study.status !== "AVAILABLE" || !study.orthancId',
  'code: "STUDY_NOT_READY"',
]);
mustContain("src/components/ImagingStudiesPanel.tsx", ['s.status !== "AVAILABLE"', "Awaiting PACS verification"]);
mustContain("prisma/migrations/20261012080000_imaging_study/migration.sql", [
  "CREATE TABLE IF NOT EXISTS \"ImagingStudy\"",
  "studyInstanceUid",
]);
mustContain("docs/PACS_INTEGRATION.md", ["Orthanc", "OHIF", "Vercel", "PACS_ENABLED"]);
mustContain("services/pacs/docker-compose.yml", ["orthanc", "8042"]);
if (failures.length) {
  console.error("verify-pacs-imaging-contracts FAILED:");
  failures.forEach((f) => console.error(" -", f));
  process.exit(1);
}
console.log("verify-pacs-imaging-contracts OK");
