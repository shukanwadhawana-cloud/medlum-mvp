import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const pdfWorker = resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const pdfTarget = resolve("public/pdf.worker.min.mjs");
mkdirSync(dirname(pdfTarget), { recursive: true });
copyFileSync(pdfWorker, pdfTarget);
console.log("Copied pdfjs worker to public/pdf.worker.min.mjs");

// Serve Tesseract's worker and WASM core same-origin instead of depending on a
// third-party executable-code CDN at runtime. Language data remains a separate
// static download and OCR remains entirely in the browser.
const tesseractWorker = resolve("node_modules/tesseract.js/dist/worker.min.js");
const tesseractTarget = resolve("public/tesseract/worker.min.js");
mkdirSync(dirname(tesseractTarget), { recursive: true });
if (!existsSync(tesseractWorker)) {
  throw new Error("Tesseract worker asset was not found at " + tesseractWorker);
}
copyFileSync(tesseractWorker, tesseractTarget);

const coreSource = resolve("node_modules/tesseract.js-core");
const coreTarget = resolve("public/tesseract/core");
mkdirSync(coreTarget, { recursive: true });
const coreFiles = readdirSync(coreSource).filter((name) => /\\.(?:js|wasm)$/.test(name));
if (!coreFiles.some((name) => name.endsWith(".wasm.js")) || !coreFiles.some((name) => name.endsWith(".wasm"))) {
  throw new Error("Tesseract WASM core JS/WASM assets were not found in " + coreSource);
}
for (const name of coreFiles) {
  copyFileSync(resolve(coreSource, name), resolve(coreTarget, name));
}
console.log("Copied Tesseract worker and " + coreFiles.length + " core assets to public/tesseract");
