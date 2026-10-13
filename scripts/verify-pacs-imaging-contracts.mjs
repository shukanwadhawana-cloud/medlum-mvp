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
mustContain("src/lib/pacs.ts", [
  "getPacsConfig",
  "buildOhifViewerUrl",
  "findOrthancStudyByUid",
  "PACS_ENABLED",
  "uid.length > 64",
  "These query parameters do not configure a datasource",
  'process.env.NODE_ENV !== "production"',
  'u.protocol === "https:"',
  "/tools/find",
  "UID_MISMATCH",
]);
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
  'const status = "PENDING";',
  "uid.length > 64",
  "Never accept an Orthanc object ID from the browser",
  'study.status !== "AVAILABLE" || !study.orthancId',
  'code: "STUDY_NOT_READY"',
  "never let browser input clear a verified orthancId",
]);
mustContain("src/app/api/imaging-studies/import/route.ts", [
  "getSession",
  "requireActiveClinicMembership",
  "PACS_UNAVAILABLE",
  "diagnosticOrderId",
  "ORDER_PATIENT_MISMATCH",
  "ORDER_CANCELLED",
  "/instances",
  '"Content-Type": "application/dicom"',
  "findOrthancStudyByUid",
  "DICOM_PATIENT_ID_MISMATCH",
  "import_identity_rejected",
  "LINK_CONFLICT",
  'identityMode === "matched" ? "AVAILABLE" : "IDENTITY_UNVERIFIED"',
  "identityStatus",
  "identityMode",
]);
mustContain("src/app/api/imaging-studies/confirm-identity/route.ts", [
  "getSession",
  "requireActiveClinicMembership",
  "findAuthorizedPatient",
  "IDENTITY_UNVERIFIED",
  "confirmed !== true",
  "findOrthancStudyByUid",
  "identity_confirmed",
  "explicit_clinician_confirmation",
  "status = 'AVAILABLE'",
]);

mustContain("src/app/api/imaging-studies/verify/route.ts", [
  "getSession",
  "requireActiveClinicMembership",
  "findOrthancStudyByUid",
  "RBAC_DENIED",
  "STUDY_NOT_IN_PACS",
  "AVAILABLE",
  "verify_attempt",
  "verify_failed",
  "Browser clients cannot supply orthancId",
  "IDENTITY_CONFIRMATION_REQUIRED",
]);
const verifySrc = fs.readFileSync(path.join(root, "src/app/api/imaging-studies/verify/route.ts"), "utf8");
if (/body\.orthancId/.test(verifySrc) || /body\.status/.test(verifySrc)) {
  failures.push("verify route must not trust browser orthancId or status");
}
mustContain("src/components/ImagingStudiesPanel.tsx", [
  's.status !== "AVAILABLE"',
  "Awaiting PACS verification",
  "/api/imaging-studies/verify",
  "Verify in PACS",
  'window.open("about:blank", "_blank")',
  "viewerTab.opener = null",
  "viewerTab.location.replace(target.toString())",
  "Allow pop-ups for MedLum",
  "The configured PACS viewer must use HTTPS.",
  "Import DICOM study",
  "/api/imaging-studies/import",
  "Import and link DICOM",
  "Choose a DICOM instance for this patient and diagnostic order.",
  "Patient identity could not be confirmed from the DICOM PatientID.",
  "Confirm patient identity",
  "/api/imaging-studies/confirm-identity",
  "explicitly confirmed by an authorized clinician",
  's.status !== "IDENTITY_UNVERIFIED"',
  'data.identityMode === "matched"',
  "Patient identity could not be confirmed from the DICOM PatientID.",
  'importNotice.kind === "warning"',
]);
mustContain("src/app/diagnostics/page.tsx", [
  "ImagingStudiesPanel",
  "diagnosticOrderId={o.id}",
]);
mustContain("prisma/migrations/20261012080000_imaging_study/migration.sql", [
  'CREATE TABLE IF NOT EXISTS "ImagingStudy"',
  "studyInstanceUid",
]);
mustContain("docs/PACS_INTEGRATION.md", ["Orthanc", "OHIF", "Vercel", "PACS_ENABLED", "verify"]);
mustContain("services/pacs/docker-compose.yml", ["orthanc", "8042"]);
mustContain("scripts/verify-pacs-ohif-browser.mjs", [
  "chromium.launch",
  "StudyInstanceUIDs",
  "canvas.toDataURL",
  "renderedCanvases",
]);
mustContain(".github/workflows/ci.yml", [
  "Render synthetic DICOM in OHIF browser",
  "ohif/app:v3.9.2",
  "verify-pacs-ohif-browser.mjs",
]);
if (failures.length) {
  console.error("verify-pacs-imaging-contracts FAILED:");
  failures.forEach((f) => console.error(" -", f));
  process.exit(1);
}
console.log("verify-pacs-imaging-contracts OK");
