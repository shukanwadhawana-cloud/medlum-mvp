/** Clinical Assist OCR — fully on-device pdfjs / Tesseract; no hosted OCR dependency. */
export type ScanResult = {
  text: string;
  confidence: number | null;
  label: string;
  partial?: boolean;
};

const MAX_BYTES = 8 * 1024 * 1024;
type OcrProgress = (message: string) => void;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function isPdf(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

async function clientPdfTextLayer(file: File): Promise<ScanResult | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const maxPages = Math.min(doc.numPages, 12);
    const parts: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? String((item as { str?: string }).str || "") : ""))
        .join(" ");
      if (line.trim()) parts.push(line.trim());
    }
    const text = parts.join("\n").trim();
    if (text.length < 20) return null;
    return { text: text.slice(0, 20_000), confidence: null, label: "pdf-text (on-device)", partial: doc.numPages > maxPages };
  } catch {
    return null;
  }
}

async function createLocalTesseractWorker(onProgress?: OcrProgress) {
  onProgress?.("Loading OCR engine and English language data…");
  const { createWorker } = await import("tesseract.js");
  const workerPromise = createWorker("eng", 1, {
    // Same-origin worker + WASM core (copied in prebuild). CSP must include
    // 'wasm-unsafe-eval' so the Emscripten module can compile WebAssembly.
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    // LSTM OEM expects the quantized best_int data (library default when langPath omitted).
    // Explicit path keeps CSP connect-src targets intentional.
    langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int",
    // Direct Worker (no blob importScripts) is more reliable on mobile Safari
    // when the script is same-origin.
    workerBlobURL: false,
    logger: (event: { status?: string; progress?: number }) => {
      if (event.status === "loading tesseract core") onProgress?.("Loading OCR engine…");
      else if (event.status === "loading language traineddata") onProgress?.("Loading English OCR data…");
      else if (event.status === "initializing tesseract") onProgress?.("Initializing OCR engine…");
      else if (event.status === "recognizing text") {
        const percent = typeof event.progress === "number" ? Math.round(event.progress * 100) : null;
        onProgress?.(percent === null ? "Recognizing text…" : "Recognizing text… " + percent + "%");
      }
    },
  });
  let worker;
  try {
    worker = await withTimeout(workerPromise, 60_000, "OCR engine did not finish loading within 60 seconds. Check the connection and try again.");
  } catch (error) {
    void workerPromise.then((lateWorker) => lateWorker.terminate()).catch(() => {});
    throw error;
  }
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  } as Record<string, string>);
  return worker;
}

async function clientTesseractOcr(file: File, onProgress?: OcrProgress): Promise<ScanResult> {
  const worker = await createLocalTesseractWorker(onProgress);
  try {
    const result = await withTimeout(worker.recognize(file), 90_000, "OCR did not finish within 90 seconds. Try a smaller or clearer image.");
    const text = String(result?.data?.text || "").trim();
    const confidence =
      typeof result?.data?.confidence === "number" ? result.data.confidence : null;
    if (!text) throw new Error("No readable text was detected. Try a sharper, better-lit photo.");
    return { text: text.slice(0, 20_000), confidence, label: "tesseract (on-device)" };
  } finally {
    try { await worker.terminate(); } catch { /* ignore */ }
  }
}

async function clientScannedPdfOcr(file: File, onProgress?: OcrProgress): Promise<ScanResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const maxPages = Math.min(doc.numPages, 3);
  const worker = await createLocalTesseractWorker(onProgress);
  const parts: string[] = [];
  let confidenceSum = 0;
  let confidenceN = 0;
  try {
    for (let i = 1; i <= maxPages; i++) {
      onProgress?.("OCR on PDF page " + i + " of " + maxPages + "…");
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not create a local OCR canvas.");
      await page.render({ canvasContext: context, viewport }).promise;
      try {
        const result = await withTimeout(worker.recognize(canvas), 90_000, "OCR timed out on PDF page " + i + ". Try a smaller or clearer PDF.");
        const text = String(result?.data?.text || "").trim();
        if (text) parts.push(text);
        if (typeof result?.data?.confidence === "number") {
          confidenceSum += result.data.confidence;
          confidenceN += 1;
        }
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    const text = parts.join("\n").trim();
    if (!text) throw new Error("No readable text was detected in the scanned PDF.");
    return {
      text: text.slice(0, 20_000),
      confidence: confidenceN ? confidenceSum / confidenceN : null,
      label: "tesseract (on-device PDF OCR)",
      partial: doc.numPages > maxPages,
    };
  } finally {
    try { await worker.terminate(); } catch { /* ignore */ }
  }
}

export async function runClinicalAssistOcr(
  file: File,
  onProgress?: OcrProgress
): Promise<ScanResult> {
  if (file.size > MAX_BYTES) {
    throw new Error("File is larger than 8 MB. Use a smaller image or PDF.");
  }
  // OCR is deliberately local-first and local-only: no Railway/PaddleOCR call.
  if (isPdf(file)) {
    const textLayer = await clientPdfTextLayer(file);
    if (textLayer) return textLayer;
    return clientScannedPdfOcr(file, onProgress);
  }
  return clientTesseractOcr(file, onProgress);
}
