/**
 * Client for MedLum private OCR service (self-hosted PaddleOCR).
 * Clinical documents never leave MedLum-controlled infrastructure.
 * Do not log document content or patient identifiers.
 */

export type OcrServiceStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "LOW_CONFIDENCE"
  | "UNSUPPORTED"
  | "FAILED";

export type OcrPageResult = {
  page: number;
  text: string;
  confidence: number | null;
};

export type OcrServiceResult = {
  requestId: string;
  status: OcrServiceStatus;
  pageCount: number;
  pages: OcrPageResult[];
  text: string;
  errorCode?: string;
  errorMessage?: string;
};

const DEFAULT_TIMEOUT_MS = 90_000;

export function isOcrServiceConfigured(): boolean {
  return Boolean(String(process.env.OCR_SERVICE_URL || "").trim());
}

export async function callPrivateOcrService(input: {
  bytes: Buffer;
  mime: string;
  filename: string;
  requestId: string;
  clinicId: string;
}): Promise<OcrServiceResult> {
  const base = String(process.env.OCR_SERVICE_URL || "").replace(/\/$/, "");
  const secret = String(process.env.OCR_SERVICE_SECRET || "").trim();
  if (!base) {
    return {
      requestId: input.requestId,
      status: "FAILED",
      pageCount: 0,
      pages: [],
      text: "",
      errorCode: "OCR_SERVICE_UNCONFIGURED",
      errorMessage: "OCR service is not configured.",
    };
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.bytes)], { type: input.mime });
  form.append("file", blob, input.filename || "document");
  form.append("requestId", input.requestId);
  form.append("clinicId", input.clinicId);

  const headers: Record<string, string> = {};
  if (secret) headers.Authorization = `Bearer ${secret}`;
  headers["X-Request-Id"] = input.requestId;
  headers["X-Clinic-Id"] = input.clinicId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/ocr`, {
      method: "POST",
      body: form,
      headers,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Partial<OcrServiceResult> & {
      error?: string;
    };
    if (!res.ok) {
      return {
        requestId: input.requestId,
        status: "FAILED",
        pageCount: 0,
        pages: [],
        text: "",
        errorCode: "OCR_SERVICE_HTTP_" + res.status,
        errorMessage: String(json.errorMessage || json.error || "OCR service request failed."),
      };
    }
    const pages = Array.isArray(json.pages) ? json.pages : [];
    const text =
      typeof json.text === "string"
        ? json.text
        : pages.map((p) => p.text || "").join("\n\n");
    return {
      requestId: String(json.requestId || input.requestId),
      status: (json.status as OcrServiceStatus) || (text.trim() ? "SUCCESS" : "FAILED"),
      pageCount: Number(json.pageCount || pages.length || 0),
      pages: pages.map((p, i) => ({
        page: Number(p.page ?? i + 1),
        text: String(p.text || ""),
        confidence: p.confidence == null ? null : Number(p.confidence),
      })),
      text,
      errorCode: json.errorCode,
      errorMessage: json.errorMessage,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      requestId: input.requestId,
      status: "FAILED",
      pageCount: 0,
      pages: [],
      text: "",
      errorCode: aborted ? "OCR_TIMEOUT" : "OCR_SERVICE_UNAVAILABLE",
      errorMessage: aborted
        ? "OCR timed out. Try a smaller document or fewer pages."
        : "OCR service is temporarily unavailable.",
    };
  } finally {
    clearTimeout(timer);
  }
}
