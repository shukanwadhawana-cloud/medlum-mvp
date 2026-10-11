#!/usr/bin/env node
/**
 * Static regression checks for Clinical Assist OCR.
 * Does not use clinical files, network calls, or production data.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const page = readFileSync("src/app/clinical-assist/page.tsx", "utf8");
const ocr = readFileSync("src/lib/clinical-assist-ocr.ts", "utf8");

assert.ok(page.includes('setScanText("");'), "new upload clears prior OCR text");
assert.ok(page.includes('setScanConfidence(null);'), "new upload clears prior confidence");
assert.ok(page.includes("text.length < 20"), "very short output is rejected");
assert.ok(page.includes("Source: ${best.label}"), "status identifies extraction method");
assert.ok(page.includes("characters extracted"), "status shows extracted text length");
assert.ok(page.includes("against the original document"), "status requires source verification");
assert.ok(page.includes("file.size > 8 * 1024 * 1024"), "UI applies 8 MB limit");
assert.ok(ocr.includes("const MAX_BYTES = 8 * 1024 * 1024"), "OCR utility matches UI size limit");
assert.ok(ocr.includes("clientScannedPdfOcr"), "scanned PDF fallback remains enabled");
assert.ok(ocr.includes("clientTesseractOcr"), "image OCR remains enabled");
assert.ok(ocr.includes("No readable text was detected"), "empty OCR fails explicitly");

console.log("Clinical Assist OCR regression checks passed.");
