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
  // Same-origin worker + core (copied in prebuild). workerBlobURL must be false:
  // blob workers break Emscripten locateFile for sibling .wasm files, which leaves
  // Core() hanging after "loading tesseract core" (observed on production origin).
  // Cross-origin Worker() is blocked by the browser; same-origin Worker is allowed.
  const workerPromise = createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    workerBlobURL: false,
    cacheMethod: "none",
    logger: (event: { status?: string; progress?: number }) => {
      if (event.status === "loading tesseract core") onProgress?.("Loading OCR engine…");
      else if (event.status === "loading language traineddata") onProgress?.("Loading English OCR data…");
      else if (event.status === "initializing tesseract") onProgress?.("Initializing OCR engine…");
      else if (event.status === "initializing api") onProgress?.("Preparing OCR language model…");
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
  const worker = await createLocalTesseractWorker(onProgress);
  try {
    const pages = Math.min(doc.numPages, 5);
    const parts: string[] = [];
    const confidences: number[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      try {
        const source = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 1800 / Math.max(source.width, 1));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create a local OCR canvas.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        onProgress?.("Recognizing PDF page " + i + " of " + pages + "…");
        const result = await withTimeout(worker.recognize(canvas), 90_000, "OCR timed out on PDF page " + i + ". Try a smaller or clearer PDF.");
        const text = String(result?.data?.text || "").trim();
        const confidence =
          typeof result?.data?.confidence === "number" ? result.data.confidence : null;
        if (text) parts.push(`[Page ${i}]\n${text}`);
        if (confidence != null) confidences.push(confidence);
        canvas.width = 1;
        canvas.height = 1;
      } finally {
        page.cleanup();
      }
    }
    const text = parts.join("\n\n").trim();
    if (!text) throw new Error("No readable text was detected. Try a sharper scan or image.");
    const confidence =
      confidences.length ? Math.round(confidences.reduce((a,b) => a+b, 0) / confidences.length) : null;
    return {
      text: text.slice(0, 20_000),
      confidence,
      label: "tesseract (on-device PDF OCR)",
      partial: doc.numPages > pages,
    };
  } finally {
    try { await worker.terminate(); } catch { /* ignore */ }
    await doc.destroy();
  }
}

export async function runClinicalAssistOcr(file: File, onProgress?: OcrProgress): Promise<ScanResult> {
  if (file.size <= 0) throw new Error("The selected document is empty.");
  if (file.size > MAX_BYTES) {
    throw new Error("Document is larger than 8 MB. Choose a smaller PDF or image, or compress the photo.");
  }

  // OCR is deliberately local-first and local-only: no Railway/PaddleOCR call.
  if (isPdf(file)) {
    const pdfText = await clientPdfTextLayer(file);
    if (pdfText) return pdfText;
    return clientScannedPdfOcr(file, onProgress);
  }

  return clientTesseractOcr(file, onProgress);
}
