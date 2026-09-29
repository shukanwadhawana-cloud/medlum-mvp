import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { canAccessModule } from "@/lib/permissions";
import { extractClinicalOcrText } from "@/lib/clinical-ocr";

export const maxDuration = 45;

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/heic",
  "image/heif",
]);

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function resolveMime(file: File): string {
  const raw = String(file.type || "").toLowerCase().trim();
  if (ALLOWED_MIME.has(raw)) return raw === "image/jpg" ? "image/jpeg" : raw;
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return raw;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return fail("Unauthorized", 401);

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return fail("No active clinic membership", 403);

  const role = normalizeClinicRole(membership.role);
  if (!canAccessModule(role, "clinical_assist")) {
    return fail("Your role cannot use clinical documentation assist.", 403);
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES + 32_768) {
    return fail("Document is too large. Maximum size is 8 MB.", 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Invalid document upload.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail("A document file is required.");
  if (file.size <= 0) return fail("The uploaded document is empty.");
  if (file.size > MAX_UPLOAD_BYTES) return fail("Document is too large. Maximum size is 8 MB.", 413);
  const mime = resolveMime(file);
  if (!ALLOWED_MIME.has(mime) && !mime.startsWith("image/")) {
    return fail("Unsupported document type. Upload a PDF, JPG, PNG, or WebP image.");
  }
  if (mime === "image/heic" || mime === "image/heif") {
    return fail("HEIC/HEIF photos are not supported for OCR yet. Export or retake as JPG or PNG, or upload a PDF.");
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const ocrPromise = extractClinicalOcrText(bytes, mime);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("OCR_TIMEOUT")), 40_000)
    );
    const extracted = await Promise.race([ocrPromise, timeoutPromise]);
    if (!extracted.trim()) {
      return fail("OCR completed but no readable text was detected. Try a higher-contrast scan or a text-based PDF.", 422);
    }

    return NextResponse.json({
      success: true,
      text: extracted.slice(0, 20_000),
      truncated: extracted.length > 20_000,
      source: "server",
      mime,
      status: "DRAFT",
      disclaimer: "OCR output is a drafting aid. Verify the source document and extracted text before saving or acting clinically.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "error";
    console.error("clinical OCR error", msg);
    if (msg === "OCR_TIMEOUT") {
      return fail("OCR is taking too long on this document. Try a clearer photo, a smaller PDF, or a text-based PDF.", 504);
    }
    if (/Unsupported document type/i.test(msg)) {
      return fail("Unsupported document type. Upload a PDF, JPG, PNG, or WebP image.");
    }
    if (/pdf|PDF/i.test(msg) && /password|encrypted/i.test(msg)) {
      return fail("This PDF appears protected or encrypted. Upload an unlocked PDF.");
    }
    return fail("Document OCR could not be completed. Try a clearer PDF or image, or a different file.", 422);
  }
}
