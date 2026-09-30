import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { canAccessModule } from "@/lib/permissions";
import { extractClinicalOcrText } from "@/lib/clinical-ocr";
import { callPrivateOcrService, isOcrServiceConfigured } from "@/lib/ocr-service-client";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

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

function looksLikePdf(bytes: Buffer) {
  return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

function looksLikeJpeg(bytes: Buffer) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function looksLikePng(bytes: Buffer) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function looksLikeWebp(bytes: Buffer) {
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
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
    return fail("Document is larger than 8 MB. Choose a smaller PDF or image.", 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Could not read the uploaded document.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail("No document was uploaded.");
  if (file.size <= 0) return fail("The selected document is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail("Document is larger than 8 MB. Choose a smaller PDF or image.", 413);
  }

  const mime = resolveMime(file);
  if (!mime || (!mime.startsWith("image/") && mime !== "application/pdf")) {
    return fail("Unsupported document type. Upload a PDF, JPG, PNG, or WebP image.");
  }
  if (mime === "image/heic" || mime === "image/heif") {
    return fail(
      "HEIC/HEIF photos are not supported for OCR yet. Export or retake as JPG or PNG, or upload a PDF."
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (mime === "application/pdf" && !looksLikePdf(bytes))
      return fail("The selected PDF is not a valid PDF file.");
    if (mime === "image/jpeg" && !looksLikeJpeg(bytes))
      return fail("The selected JPG is not a valid JPEG image.");
    if (mime === "image/png" && !looksLikePng(bytes))
      return fail("The selected PNG is not a valid PNG image.");
    if (mime === "image/webp" && !looksLikeWebp(bytes))
      return fail("The selected WebP is not a valid WebP image.");

    const requestId = randomUUID();
    const filename = String(file.name || "document");

    // Prefer private self-hosted PaddleOCR (Render/Docker). No third-party OCR SaaS.
    if (isOcrServiceConfigured()) {
      const remote = await callPrivateOcrService({
        bytes,
        mime,
        filename,
        requestId,
        clinicId: membership.clinicId,
      });
      if (remote.status === "UNSUPPORTED") {
        return fail(remote.errorMessage || "Unsupported document type for OCR.", 415);
      }
      if (!remote.text.trim() && remote.status !== "LOW_CONFIDENCE") {
        return fail(
          remote.errorMessage ||
            "Document OCR could not be completed. Try a clearer PDF or image, or retry later."
        );
      }
      return NextResponse.json({
        success: true,
        requestId: remote.requestId,
        status: remote.status,
        text: remote.text.slice(0, 20_000),
        truncated: remote.text.length > 20_000,
        pageCount: remote.pageCount,
        pages: remote.pages,
        engine: "paddleocr-private",
        source: "ocr-service",
        disclaimer:
          "OCR output is a drafting aid. Verify the source document and extracted text before saving or acting clinically.",
      });
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("OCR_TIMEOUT")), 55_000);
    });
    const extracted = await Promise.race([extractClinicalOcrText(bytes, mime), timeoutPromise]);
    if (!extracted.text.trim()) {
      return fail(
        "OCR completed but no readable text was detected. Try a higher-contrast scan or a text-based PDF.",
        422
      );
    }

    return NextResponse.json({
      success: true,
      text: extracted.text.slice(0, 20_000),
      truncated: extracted.text.length > 20_000,
      source: "server",
      method: extracted.method,
      confidence: extracted.confidence,
      pageLimitReached: Boolean(extracted.pageLimitReached),
      mime,
      status: "DRAFT",
      disclaimer:
        "OCR output is a drafting aid. Verify the source document and extracted text before saving or acting clinically.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("clinical OCR error", msg.slice(0, 200));
    if (msg === "OCR_TIMEOUT") {
      return fail(
        "OCR is taking too long on this document. Try a clearer photo, a smaller PDF, or a text-based PDF.",
        504
      );
    }
    if (/password|encrypted/i.test(msg)) {
      return fail("This PDF appears protected or encrypted. Upload an unlocked PDF.", 422);
    }
    if (/Unsupported document type|HEIC|HEIF/i.test(msg)) {
      return fail("Unsupported document type. Upload a PDF, JPG, PNG, or WebP image (not HEIC).");
    }
    if (/Cannot find module|worker|wasm|ENOENT|network|fetch/i.test(msg)) {
      return NextResponse.json(
        {
          success: false,
          error: "Server OCR is unavailable on this deployment. Retrying on your device…",
          code: "OCR_SERVER_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: "Document OCR could not be completed. Try a clearer PDF or image, or a different file.",
        code: "OCR_FAILED",
      },
      { status: 422 }
    );
  }
}
