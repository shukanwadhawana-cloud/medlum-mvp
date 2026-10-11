import fs from "node:fs";
import assert from "node:assert/strict";

/** Static regression checks only; never reads or transmits clinical documents. */
const page = fs.readFileSync("src/app/clinical-assist/page.tsx", "utf8");
const ocr = fs.readFileSync("src/lib/clinical-assist-ocr.ts", "utf8");

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
assert(middleware.includes("https://cdn.jsdelivr.net"), "CSP must allow the Tesseract.js worker/core CDN");
assert(middleware.includes("https://tessdata.projectnaptha.com"), "CSP must allow Tesseract language-data downloads");
assert(page.includes("Check browser console for the underlying OCR engine error."), "non-Error OCR failures must expose a useful diagnostic message");
