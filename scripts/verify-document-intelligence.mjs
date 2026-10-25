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
ok(upload.includes('existing.ocrStatus === "FAILED"') === false, "upload endpoint no longer performs synchronous server OCR retries");
ok(upload.includes("LAB_DOCUMENT_OCR_RETRY_QUEUED"), "duplicate retry queues on-device extraction with an audit event");
ok(upload.includes('ocrStatus: "PENDING"') && !upload.includes("extractLabOcrDraft"), "upload stores the original promptly and does not run server OCR in the upload request");
ok(upload.includes("provider.upload(storageKey, buf, normalizedMime)"), "original bytes are durably stored before upload success is returned");
ok(upload.includes("DURABLE_STORAGE_REQUIRED") && upload.includes('provider.name === "processed"'), "metadata-only processed storage is explicitly rejected for lab reports");
ok(existsSync("src/lib/storage/database.ts"), "durable database binary-storage fallback exists");
ok(readFileSync("src/lib/storage/database.ts", "utf8").includes("tx.storedBinaryObject.upsert"), "database provider persists report bytes");
ok(schema.includes("model StoredBinaryObject"), "durable binary-storage Prisma model exists");
ok(existsSync("prisma/migrations/20261021150000_durable_lab_report_storage/migration.sql"), "durable binary-storage migration exists");

ok(existsSync("src/app/api/labs/documents/[id]/retry/route.ts"), "retry extraction route exists");
const retry = readFileSync("src/app/api/labs/documents/[id]/retry/route.ts", "utf8");
ok(retry.includes("requireActiveClinicMembership"), "retry route derives tenant from session membership");
ok(retry.includes('["FAILED", "PENDING"].includes(doc.ocrStatus)'), "retry route accepts pending or failed extraction states");
ok(retry.includes("provider.getObject(doc.storageKey)"), "retry route uses stored original bytes");
ok(retry.includes("LAB_DOCUMENT_OCR_RETRY_QUEUED") && !retry.includes("extractLabOcrDraft"), "retry queues a client-side extraction instead of server-side OCR");
ok(retry.includes("verified: false"), "retry output remains an unverified draft");

const retryPanel = readFileSync("src/components/LabResultDocumentPanel.tsx", "utf8");
ok(retryPanel.includes("retryExtraction"), "report panel exposes retry extraction action");
ok(retryPanel.includes("Retry Clinical Assist extraction"), "retry action clearly identifies Clinical Assist");
ok(retryPanel.includes("rawTextPreview"), "report panel restores retained OCR text on initial load");
ok(retryPanel.includes("Clinical Assist could not create a structured draft"), "failed state explains the enhanced extraction path");
ok(retryPanel.includes("original report is stored with this document"), "panel describes durable report storage accurately");
ok(retryPanel.includes("Select the exact original file that was uploaded") || retryPanel.includes("re-select the exact same file"), "panel explains checksum-validated recovery for an unavailable original file");
const assistOcr = readFileSync("src/lib/clinical-assist-ocr.ts", "utf8");
ok(assistOcr.includes("export async function prepareClinicalAssistImage"), "shared on-device image preprocessor exists");
ok(retryPanel.includes("runClinicalAssistImageOcr(originalFile"), "report panel uses shared preprocessing and original-image OCR fallback");
const clinicalAssistPage = readFileSync("src/app/clinical-assist/page.tsx", "utf8");
ok(clinicalAssistPage.includes("runClinicalAssistImageOcr(file"), "standalone Clinical Assist uses shared preprocessing and original-image OCR fallback");
ok(ocrLib.includes("primaryFailed || Object.keys(draft).length < 4"), "Clinical Assist fallback runs when primary OCR errors or finds too few values");
ok(ocrLib.includes("Initial lab OCR pass failed:"), "primary OCR errors are retained as diagnostics instead of skipping fallback");

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

const clinicalAssistRoutePath = "src/app/api/labs/documents/[id]/clinical-assist/route.ts";
ok(existsSync(clinicalAssistRoutePath), "Clinical Assist retry endpoint exists");
const clinicalAssistRoute = readFileSync(clinicalAssistRoutePath, "utf8");
ok(clinicalAssistRoute.includes("requireActiveClinicMembership") && clinicalAssistRoute.includes("clinicId: membership.clinicId"), "Clinical Assist retry is clinic-scoped");
ok(clinicalAssistRoute.includes("extractCandidates(text)"), "Clinical Assist OCR text is parsed into candidate lab values");
ok(clinicalAssistRoute.includes('verified: false') && clinicalAssistRoute.includes("LAB_DOCUMENT_CLINICAL_ASSIST_RETRY"), "Clinical Assist output remains an audited draft");
ok(clinicalAssistRoute.includes('["FAILED", "PENDING"].includes(doc.ocrStatus)') && clinicalAssistRoute.includes('ocrStatus: { in: ["FAILED", "PENDING"] }') && clinicalAssistRoute.includes("updateMany"), "Clinical Assist accepts new uploads and uses compare-and-set protection against concurrent verification");
ok(clinicalAssistRoute.includes("A valid source-report fingerprint is required") && clinicalAssistRoute.includes("doc.checksum.toLowerCase() !== sourceChecksum"), "Clinical Assist server binds OCR drafts to the saved report checksum");

ok(view.includes('searchParams.get("raw") === "1"'), "authenticated document viewer supports same-origin raw bytes for local OCR");
const documentRoute = readFileSync("src/app/api/labs/documents/route.ts", "utf8");
ok(documentRoute.includes("checksum: true"), "document list exposes stored report checksum for source matching");
const panelClinicalAssist = readFileSync("src/components/LabResultDocumentPanel.tsx", "utf8");
ok(panelClinicalAssist.includes("sourceChecksum: suppliedChecksum"), "Clinical Assist sends the validated source checksum to the server");
ok(panelClinicalAssist.includes("runClinicalAssistOcr") && panelClinicalAssist.includes("Extract with Clinical Assist") && panelClinicalAssist.includes("await extractWithClinicalAssist(file, doc)"), "uploaded report automatically runs on-device Clinical Assist without blocking storage upload");
ok(panelClinicalAssist.includes("sha256Hex") && (panelClinicalAssist.includes("selectedDoc.checksum") || panelClinicalAssist.includes("targetDoc.checksum")), "OCR source file checksum is validated before association");
ok(panelClinicalAssist.includes("Choose the original report file"), "staff can reselect the same report when the provider did not retain original bytes");
ok(panelClinicalAssist.includes("setAssistSourceFile(file)"), "the exact just-uploaded file is retained in memory for immediate local extraction");


const serverOcr = readFileSync("src/app/api/labs/documents/[id]/ocr/route.ts", "utf8");
ok(serverOcr.includes("CLIENT_EXTRACTION_REQUIRED") && !serverOcr.includes("extractLabOcrDraft"), "legacy server OCR endpoint directs clients to robust on-device extraction");
const storageIndex = readFileSync("src/lib/storage/index.ts", "utf8");
ok(storageIndex.includes("createDatabaseStorageProvider") && storageIndex.includes("isServerlessRuntime()"), "production/serverless storage defaults to durable binary storage");
ok(storageIndex.includes("MAX_UPLOAD_BYTES = 8 * 1024 * 1024"), "server upload size matches the on-device OCR safety limit");

if (fails.length) {
  console.error("FAIL document-intelligence:");
  fails.forEach((f) => console.error("-", f));
  process.exit(1);
}
console.log("Document intelligence verification PASSED");
