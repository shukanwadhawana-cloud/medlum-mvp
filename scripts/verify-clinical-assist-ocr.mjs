import fs from "node:fs";
import assert from "node:assert/strict";

/** Static regression checks only; never reads or transmits clinical documents. */
const page = fs.readFileSync("src/app/clinical-assist/page.tsx", "utf8");
const ocr = fs.readFileSync("src/lib/clinical-assist-ocr.ts", "utf8");
const panel = fs.readFileSync("src/components/LabResultDocumentPanel.tsx", "utf8");

assert(page.includes('setScanText("");'), "new upload clears previous OCR text");
assert(page.includes("text.length < 20"), "very short output is rejected");
assert(page.includes("Source: ${best.label}"), "status identifies extraction method");
assert(page.includes("characters extracted"), "status shows extracted character count");
assert(page.includes("against the original document"), "status requires source verification");
assert(page.includes('file.size > 8 * 1024 * 1024'), "UI applies 8 MB limit");
assert(ocr.includes("const MAX_BYTES = 8 * 1024 * 1024"), "OCR utility matches UI size limit");
assert(ocr.includes("clientScannedPdfOcr"), "scanned PDF fallback remains enabled");
assert(ocr.includes("clientTesseractOcr"), "image OCR remains enabled");
assert(ocr.includes("No readable text was detected"), "empty OCR fails explicitly");

console.log("Clinical Assist OCR regression checks: PASS");

const middleware = fs.readFileSync("src/middleware.ts", "utf8");
assert(middleware.includes("https://cdn.jsdelivr.net"), "CSP must allow jsDelivr for optional language-data CDN");
assert(middleware.includes("wasm-unsafe-eval"), "CSP must allow WebAssembly for Tesseract core");
assert(middleware.includes("worker-src") && middleware.includes("'self'"), "CSP must allow same-origin workers");
assert(middleware.includes("blob:"), "CSP must allow blob workers for libraries that still need them");
assert(page.includes("Check browser console for the underlying OCR engine error."), "non-Error OCR failures must expose a useful diagnostic message");

assert(ocr.includes("Loading OCR engine and English language data"), "OCR must expose initialization progress");
assert(ocr.includes('workerPath: "/tesseract/worker.min.js"'), "Tesseract worker must be served same-origin");
assert(ocr.includes('corePath: "/tesseract/core"'), "Tesseract WASM core must be served same-origin");
assert(ocr.includes("workerBlobURL: false"), "Worker must not use blob URLs so Emscripten can resolve sibling .wasm files");
assert(ocr.includes('cacheMethod: "none"'), "OCR must not reuse stale IndexedDB language caches after failed inits");
assert(fs.readFileSync("scripts/copy-pdf-worker.mjs", "utf8").includes("node_modules/tesseract.js/dist/worker.min.js"), "build must copy the Tesseract worker asset");
assert(ocr.includes("60_000"), "OCR worker initialization must have a timeout");
assert(ocr.includes("90_000"), "OCR recognition must have a timeout");
assert(page.includes("(status) => setScanStatus(status)"), "UI must display live OCR engine progress");

console.log("Clinical Assist OCR CSP and worker-path checks: PASS");

assert(ocr.includes("runClinicalAssistImageOcr"), "image OCR must expose fallback flow");
assert(ocr.includes("retrying the original image"), "preprocessed OCR failure must retry untouched source image");
assert(page.includes("runClinicalAssistImageOcr(file"), "Clinical Assist page must use image fallback");
assert(panel.includes("runClinicalAssistImageOcr(originalFile"), "lab result panel must use image fallback");
console.log("Clinical Assist original-image fallback checks: PASS");
