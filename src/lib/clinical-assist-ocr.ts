/** Client-side OCR for Clinical Assist — private service only (no device Tesseract). */

export type ScanResult = {
  text: string;
  confidence: number | null;
  label: string;
  partial?: boolean;
};

export async function runClinicalAssistOcr(file: File): Promise<ScanResult> {
  if (file.size <= 0) throw new Error("The selected document is empty.");
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Document is larger than 8 MB. Choose a smaller PDF or image.");
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  try {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/clinical-ai/ocr", {
      method: "POST",
      credentials: "include",
      headers: { "X-MedLum-Requested-With": "MedLum" },
      body,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.success) {
      const text = String(payload.text || "").trim();
      if (!text) throw new Error("No readable text was detected. Try a sharper, better-lit photo.");
      return {
        text,
        confidence: typeof payload.confidence === "number" ? payload.confidence : null,
        label: String(payload.engine || payload.method || "server"),
        partial: Boolean(payload.pageLimitReached),
      };
    }
    throw new Error(
      payload?.error ||
        "Document OCR could not be completed. The private OCR service may be unavailable."
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
