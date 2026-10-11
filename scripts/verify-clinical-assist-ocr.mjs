import fs from "node:fs";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Static regression checks only; never reads or transmits clinical documents. */
const page = fs.readFileSync("src/app/clinical-assist/page.tsx", "utf8");
const ocr = fs.readFileSync("src/lib/clinical-assist-ocr.ts", "utf8");
const middleware = fs.readFileSync("src/middleware.ts", "utf8");
const copyScript = fs.readFileSync("scripts/copy-pdf-worker.mjs", "utf8");

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

assert(middleware.includes("'wasm-unsafe-eval'"), "CSP must allow WebAssembly compilation for Tesseract core");
assert(middleware.includes("https://cdn.jsdelivr.net"), "CSP must allow jsDelivr for language data / optional CDN");
assert(middleware.includes("worker-src") && middleware.includes("blob:"), "CSP worker-src must allow blob workers");
assert(middleware.includes("https://tessdata.projectnaptha.com") || middleware.includes("cdn.jsdelivr.net"), "CSP must allow language-data downloads");
assert(page.includes("Check browser console for the underlying OCR engine error."), "non-Error OCR failures must expose a useful diagnostic message");

assert(ocr.includes("Loading OCR engine and English language data"), "OCR must expose initialization progress");
assert(ocr.includes('workerPath: "/tesseract/worker.min.js"'), "Tesseract worker must be served same-origin");
assert(ocr.includes('corePath: "/tesseract/core"'), "Tesseract WASM core must be served same-origin");
assert(ocr.includes("4.0.0_best_int"), "LSTM language path must use best_int traineddata");
assert(ocr.includes("workerBlobURL: false"), "same-origin worker should use direct Worker construction");
assert(ocr.includes("60_000"), "OCR worker initialization must have a timeout");
assert(ocr.includes("90_000"), "OCR recognition must have a timeout");
assert(page.includes("(status) => setScanStatus(status)"), "UI must display live OCR engine progress");

assert(copyScript.includes("node_modules/tesseract.js/dist/worker.min.js"), "build must copy the Tesseract worker asset");
assert(copyScript.includes("tesseract.js-core"), "build must copy tesseract.js-core WASM assets");
assert(copyScript.includes("tesseract-core-simd-lstm"), "build must require LSTM SIMD core pair");

const workerPublic = resolve("public/tesseract/worker.min.js");
const corePublic = resolve("public/tesseract/core/tesseract-core-simd-lstm.wasm.js");
if (existsSync(workerPublic) || existsSync(corePublic)) {
  assert(existsSync(workerPublic), "public/tesseract/worker.min.js must exist after prebuild");
  assert(existsSync(corePublic), "public/tesseract/core LSTM SIMD wasm.js must exist after prebuild");
  assert(existsSync(resolve("public/tesseract/core/tesseract-core-simd-lstm.wasm")), "public LSTM SIMD .wasm must exist after prebuild");
}

console.log("Clinical Assist OCR regression checks: PASS");
