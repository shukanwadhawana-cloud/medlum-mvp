import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const pdfWorker = resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const pdfTarget = resolve("public/pdf.worker.min.mjs");
if (!existsSync(pdfWorker)) {
  throw new Error("pdfjs worker asset was not found at " + pdfWorker);
}
mkdirSync(dirname(pdfTarget), { recursive: true });
copyFileSync(pdfWorker, pdfTarget);
console.log("Copied pdfjs worker to public/pdf.worker.min.mjs");

// Serve Tesseract worker + WASM core same-origin (avoids CDN at runtime for executable code).
const tesseractWorker = resolve("node_modules/tesseract.js/dist/worker.min.js");
const tesseractTarget = resolve("public/tesseract/worker.min.js");
mkdirSync(dirname(tesseractTarget), { recursive: true });
if (!existsSync(tesseractWorker)) {
  throw new Error("Tesseract worker asset was not found at " + tesseractWorker);
}
copyFileSync(tesseractWorker, tesseractTarget);

const coreSource = resolve("node_modules/tesseract.js-core");
const coreTarget = resolve("public/tesseract/core");
if (!existsSync(coreSource)) {
  throw new Error("tesseract.js-core package was not found at " + coreSource);
}
mkdirSync(coreTarget, { recursive: true });
const coreFiles = readdirSync(coreSource).filter((name) => name.endsWith(".js") || name.endsWith(".wasm"));
const hasWasmJs = coreFiles.some((name) => name.endsWith(".wasm.js"));
const hasWasm = coreFiles.some((name) => name.endsWith(".wasm") && !name.endsWith(".wasm.js"));
const hasLstmSimd = coreFiles.includes("tesseract-core-simd-lstm.wasm.js") && coreFiles.includes("tesseract-core-simd-lstm.wasm");
if (!hasWasmJs || !hasWasm || !hasLstmSimd) {
  throw new Error(
    "Tesseract WASM core assets incomplete in " + coreSource +
    " (need .wasm.js, .wasm, and simd-lstm pair). Found: " + coreFiles.join(", ")
  );
}
for (const name of coreFiles) {
  copyFileSync(resolve(coreSource, name), resolve(coreTarget, name));
}
console.log("Copied Tesseract worker and " + coreFiles.length + " core assets to public/tesseract");
