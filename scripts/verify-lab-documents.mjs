#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
const fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(msg);
  else console.log("OK:", msg);
}
const schema = readFileSync("prisma/schema.prisma", "utf8");
ok(schema.includes("model MedicalDocument"), "MedicalDocument model exists");
ok(schema.includes("storageKey"), "storageKey field present");
ok(schema.includes("ocrDraft"), "ocrDraft field present");
const upload = readFileSync("src/app/api/labs/documents/route.ts", "utf8");
ok(upload.includes("requireActiveClinicMembership"), "upload requires clinic membership");
ok(upload.includes("storageQuotaBytes"), "quota check present");
ok(upload.includes("MAX_UPLOAD_BYTES"), "max upload size enforced");
ok(upload.includes("ALLOWED_MIME"), "MIME allow-list present");
const view = readFileSync("src/app/api/labs/documents/[id]/view/route.ts", "utf8");
ok(view.includes("requireActiveClinicMembership"), "view requires membership");
ok(view.includes("clinicId: membership.clinicId"), "view is tenant-scoped");
const ocr = readFileSync("src/app/api/labs/documents/[id]/ocr/route.ts", "utf8");
ok(ocr.includes("extractLabOcrDraft"), "OCR assist wired");
const ocrLib = readFileSync("src/lib/lab-ocr.ts", "utf8");
ok(ocrLib.includes("DRAFT"), "OCR produces DRAFT status");
ok(existsSync("src/lib/storage/local.ts"), "local provider");
ok(existsSync("src/lib/storage/r2.ts"), "r2 provider adapter");
const labsUi = readFileSync("src/app/labs/page.tsx", "utf8");
const labsPanel = existsSync("src/components/LabResultDocumentPanel.tsx")
  ? readFileSync("src/components/LabResultDocumentPanel.tsx", "utf8")
  : "";
const uiHasUpload =
  labsUi.includes("/api/labs/documents") || labsPanel.includes("/api/labs/documents");
const uiHasOcr = labsUi.includes("OCR draft") || labsPanel.includes("OCR draft");
const uiWired =
  labsUi.includes("LabResultDocumentPanel") || labsPanel.includes("/api/labs/documents");
ok(uiHasUpload, "labs UI upload path");
ok(uiHasOcr, "OCR draft control in UI");
ok(uiWired, "labs result document panel wired");
if (fails.length) {
  console.error("FAIL:", fails.join("\n"));
  process.exit(1);
}
console.log("Lab document storage static verification PASSED");
