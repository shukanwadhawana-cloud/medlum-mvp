import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("src/app/api/clinical-ai/ocr/route.ts", "utf8");
const client = fs.readFileSync("src/lib/ocr-service-client.ts", "utf8");
const service = fs.readFileSync("services/ocr/app.py", "utf8");
const dockerfile = fs.readFileSync("services/ocr/Dockerfile", "utf8");

assert.ok(route.includes("callPrivateOcrService"), "OCR route must call private service client");
assert.ok(route.includes("isOcrServiceConfigured"), "OCR route must gate on OCR_SERVICE_URL");
assert.ok(route.includes("filename"), "OCR route must pass original filename (numeric names)");
assert.ok(route.includes("looksLikePdf"), "OCR route must magic-byte validate PDF");
assert.ok(route.includes("requireActiveClinicMembership"), "OCR requires clinic membership");
assert.ok(route.includes('canAccessModule(role, "clinical_assist")'), "OCR requires clinical_assist");
assert.ok(!route.includes("OCR.space") && !route.includes("googleapis"), "No external OCR SaaS in route");
assert.ok(!route.includes("extractClinicalOcrText"), "Clinical OCR route must not call in-process Tesseract");
assert.ok(route.includes("OCR_SERVICE_UNCONFIGURED"), "must fail closed when OCR service unset");

assert.ok(client.includes("OCR_SERVICE_URL"), "client uses OCR_SERVICE_URL");
assert.ok(client.includes("SUCCESS") && client.includes("LOW_CONFIDENCE"), "status contract");
assert.ok(client.includes("requestId"), "requestId contract");
assert.ok(!client.includes("console.log"), "client must not log payloads");

assert.ok(service.includes("PaddleOCR") || service.includes("paddleocr"), "service uses PaddleOCR");
assert.ok(service.includes("requestId"), "service returns requestId");
assert.ok(service.includes("MAX_PAGES"), "service bounds pages");
assert.ok(
  dockerfile.includes("paddleocr") ||
    dockerfile.includes("PaddleOCR") ||
    fs.readFileSync("services/ocr/requirements.txt", "utf8").includes("paddleocr"),
  "docker deps include paddleocr"
);

const lab = fs.readFileSync("src/lib/lab-ocr.ts", "utf8");
assert.ok(lab.includes("tesseract"), "Lab OCR still independent until separately migrated");

const assist = fs.readFileSync("src/app/clinical-assist/page.tsx", "utf8");
assert.ok(!assist.toLowerCase().includes("tesseract"), "Clinical Assist must not use Tesseract");
assert.ok(!assist.includes("runClientOcr"), "Clinical Assist must not fall back to on-device OCR");
assert.ok(!assist.includes("createWorker"), "Clinical Assist must not load tesseract workers");

console.log("OCR private-path verification: PASS");
