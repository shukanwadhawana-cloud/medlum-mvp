#!/usr/bin/env node
/**
 * Document intelligence contract:
 * OCR is draft-only; human verification required for clinical result.
 */
import { readFileSync, existsSync } from "fs";

const fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(msg);
  else console.log("OK:", msg);
}

const schema = readFileSync("prisma/schema.prisma", "utf8");
ok(schema.includes("model MedicalDocument"), "MedicalDocument model");
ok(schema.includes("ocrDraft"), "ocrDraft preserves machine extraction");
ok(schema.includes("verifiedBy"), "verifiedBy actor field");
ok(schema.includes("verifiedAt"), "verifiedAt timestamp");

const ocrLib = readFileSync("src/lib/lab-ocr.ts", "utf8");
ok(ocrLib.includes("DRAFT"), "OCR status DRAFT");
ok(ocrLib.includes('createWorker("eng"'), "Tesseract image OCR enabled");
ok(ocrLib.includes('pdfjs-dist/legacy/build/pdf.mjs'), "PDF.js PDF extraction enabled");
ok(ocrLib.includes('@napi-rs/canvas'), "scanned-PDF rasterization dependency wired");
ok(!ocrLib.includes("Image OCR is not enabled"), "image OCR is not hard-disabled");
ok(!ocrLib.includes("Enter results manually"), "OCR failure does not instruct manual-first workflow");

ok(ocrLib.includes("Never invents values") || ocrLib.includes("not verified") || ocrLib.includes("DRAFT"), "OCR lib states draft-only safety");

const upload = readFileSync("src/app/api/labs/documents/route.ts", "utf8");
ok(upload.includes("requireActiveClinicMembership"), "tenant membership required");
ok(upload.includes("LAB_DOCUMENT_UPLOADED"), "upload audit");
ok(upload.includes('existing.ocrStatus === "FAILED"'), "duplicate failed report can retry extraction without creating a duplicate");
ok(upload.includes("LAB_DOCUMENT_OCR_RETRY"), "duplicate retry audit event");

ok(existsSync("src/app/api/labs/documents/[id]/retry/route.ts"), "retry extraction route exists");
const retry = readFileSync("src/app/api/labs/documents/[id]/retry/route.ts", "utf8");
ok(retry.includes("requireActiveClinicMembership"), "retry route derives tenant from session membership");
ok(retry.includes('doc.ocrStatus !== "FAILED"'), "retry route only reprocesses failed documents");
ok(retry.includes("provider.getObject(doc.storageKey)"), "retry route uses stored original bytes");
ok(retry.includes("LAB_DOCUMENT_OCR_RETRY"), "retry route audit");
ok(retry.includes("verified: false"), "retry output remains an unverified draft");

const retryPanel = readFileSync("src/components/LabResultDocumentPanel.tsx", "utf8");
ok(retryPanel.includes("retryExtraction"), "report panel exposes retry extraction action");
ok(retryPanel.includes("Retry report extraction"), "retry action has clear UI label");

const sourcePath = "src/app/api/labs/documents/[id]/source/route.ts";
ok(existsSync(sourcePath), "authenticated source route exposes the stored original for local OCR");
const source = readFileSync(sourcePath, "utf8");
ok(source.includes("requireActiveClinicMembership"), "source route derives tenant from active clinic membership");
ok(source.includes("clinicId: membership.clinicId"), "source route scopes document bytes to the active clinic");
ok(source.includes("getStorageProvider().getObject"), "source route uses stored original bytes");
ok(source.includes('"Cache-Control": "private, no-store, max-age=0"'), "source route prevents shared caching of clinical files");

const assistPath = "src/app/api/labs/documents/[id]/clinical-assist/route.ts";
ok(existsSync(assistPath), "on-device Clinical Assist draft endpoint exists");
const assist = readFileSync(assistPath, "utf8");
ok(assist.includes("requireActiveClinicMembership"), "Clinical Assist endpoint derives tenant from session membership");
ok(assist.includes('doc.ocrStatus !== "FAILED"'), "Clinical Assist cannot silently overwrite an existing non-failed draft");
ok(assist.includes("extractCandidates(text)"), "Clinical Assist OCR text is mapped into supported lab candidates");
ok(assist.includes("clinicalAssist: true"), "Clinical Assist extraction is identified in draft metadata");
ok(assist.includes("verified: false"), "Clinical Assist output remains unverified");
ok(assist.includes("LAB_DOCUMENT_CLINICAL_ASSIST"), "Clinical Assist extraction is audited without logging OCR text");

ok(retryPanel.includes('runClinicalAssistOcr'), "report panel uses the local Clinical Assist OCR engine");
ok(retryPanel.includes("/source"), "report panel retrieves the saved original for local OCR");
ok(retryPanel.includes("/clinical-assist"), "report panel submits OCR output as a draft");
ok(retryPanel.includes("Run Clinical Assist on this device"), "failed report UI exposes the Clinical Assist action");
ok(retryPanel.includes("No clinical result is written until an authorised user verifies it"), "UI explains local extraction and verification gate");

ok(existsSync("src/app/api/labs/documents/[id]/verify/route.ts"), "verify route exists");
const verify = readFileSync("src/app/api/labs/documents/[id]/verify/route.ts", "utf8");
ok(verify.includes("ACCEPT"), "ACCEPT action");
ok(verify.includes("CORRECT"), "CORRECT action");
ok(verify.includes("REJECT"), "REJECT action");
ok(verify.includes("machineCandidates"), "preserves machine extraction");
ok(verify.includes("verifiedValues"), "stores human verified values");
ok(verify.includes("prisma.labOrder.update"), "writes lab result only after verify");
ok(verify.includes("LAB_DOCUMENT_OCR_VERIFIED") || verify.includes("LAB_DOCUMENT_OCR_CORRECTED"), "verify audit");
ok(verify.includes("getSession"), "session-derived actor");

const panel = readFileSync("src/components/LabResultDocumentPanel.tsx", "utf8");
ok(panel.includes("/api/labs/documents"), "panel uses documents API");

const storage = readFileSync("src/lib/storage/index.ts", "utf8");
ok(existsSync("src/lib/storage/processed.ts"), "zero-cost processed storage provider");
ok(storage.includes("processed"), "processed provider wired");

const view = readFileSync("src/app/api/labs/documents/[id]/view/route.ts", "utf8");
ok(view.includes("clinicId: membership.clinicId"), "view tenant-scoped");

if (fails.length) {
  console.error("FAIL document-intelligence:");
  fails.forEach((f) => console.error("-", f));
  process.exit(1);
}
console.log("Document intelligence verification PASSED");
