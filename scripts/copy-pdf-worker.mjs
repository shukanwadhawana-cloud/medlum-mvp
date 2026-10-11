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

// Serve Tesseract worker and WASM core same-origin. Language data still loads from
// the library default CDN (document bytes never leave the browser).
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

// tesseract.js picks among these at runtime based on SIMD + LSTM OEM.
const requiredCore = [
  "tesseract-core.wasm.js",
  "tesseract-core.wasm",
  "tesseract-core-simd.wasm.js",
  "tesseract-core-simd.wasm",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
];
for (const name of requiredCore) {
  const src = resolve(coreSource, name);
  if (!existsSync(src)) {
    throw new Error("Required Tesseract core asset missing: " + src);
  }
  copyFileSync(src, resolve(coreTarget, name));
}

const extra = readdirSync(coreSource).filter(
  (name) => (name.endsWith(".js") || name.endsWith(".wasm")) && !requiredCore.includes(name)
);
for (const name of extra) {
  copyFileSync(resolve(coreSource, name), resolve(coreTarget, name));
}

console.log(
  "Copied Tesseract worker and " + (requiredCore.length + extra.length) + " core assets to public/tesseract"
);
