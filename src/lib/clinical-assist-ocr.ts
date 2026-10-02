/** Clinical Assist OCR — server first, then free on-device pdfjs / Tesseract. */
export type ScanResult = {
  text: string;
  confidence: number | null;
  label: string;
  partial?: boolean;
};

const MAX_BYTES = 15 * 1024 * 1024;

function isPdf(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

async function clientPdfTextLayer(file: File): Promise<ScanResult | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
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

async function clientTesseractOcr(file: File): Promise<ScanResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    } as Record<string, string>);
    const result = await worker.recognize(file);
    const text = String(result?.data?.text || "").trim();
    const confidence = typeof result?.data?.confidence === "number" ? result.data.confidence : null;
    if (!text) throw new Error("No readable text was detected. Try a sharper, better-lit photo.");
    return { text: text.slice(0, 20_000), confidence, label: "tesseract (on-device)" };
  } finally {
    try { await worker.terminate(); } catch { /* ignore */ }
  }
}

async function serverOcr(file: File, signal: AbortSignal): Promise<ScanResult> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/clinical-ai/ocr", {
    method: "POST",
    credentials: "include",
    headers: { "X-MedLum-Requested-With": "MedLum" },
    body,
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload?.success) {
    const text = String(payload.text || "").trim();
    if (!text) throw new Error("No readable text was detected. Try a sharper, better-lit photo.");
    return {
      text,
      confidence: typeof payload.confidence === "number" ? payload.confidence : null,
      label: String(payload.engine || payload.method || "server"),
      partial: Boolean(payload.pageLimitReached || payload.status === "PARTIAL"),
    };
  }
  throw new Error(payload?.error || "Document OCR could not be completed.");
}

export async function runClinicalAssistOcr(file: File): Promise<ScanResult> {
  if (file.size <= 0) throw new Error("The selected document is empty.");
  if (file.size > MAX_BYTES) {
    throw new Error("Document is larger than 15 MB. Choose a smaller PDF or image, or compress the photo.");
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    try {
      return await serverOcr(file, controller.signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new Error("OCR timed out. Try a clearer photo, a smaller PDF, or a text-based PDF.");
      }
    }
    if (isPdf(file)) {
      const pdfText = await clientPdfTextLayer(file);
      if (pdfText) return pdfText;
    }
    if (!isPdf(file)) return await clientTesseractOcr(file);
    throw new Error(
      "This PDF has no readable text layer and the OCR service is offline. Export a page as JPG/PNG and scan again, or retry shortly."
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("OCR timed out. Try a clearer photo, a smaller PDF, or a text-based PDF.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
