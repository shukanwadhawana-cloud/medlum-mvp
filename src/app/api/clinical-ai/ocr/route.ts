import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { canAccessModule } from "@/lib/permissions";
import { extractClinicalOcrText } from "@/lib/clinical-ocr";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
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
  if (!ALLOWED_MIME.has(file.type)) return fail("Unsupported document type. Upload a PDF or image.");

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const text = await extractClinicalOcrText(bytes, file.type);
    if (!text.trim()) return fail("OCR completed but no readable text was detected.", 422);

    return NextResponse.json({
      success: true,
      text: text.slice(0, 20_000),
      truncated: text.length > 20_000,
      source: "server",
      status: "DRAFT",
      disclaimer: "OCR output is a drafting aid. Verify the source document and extracted text before saving or acting clinically.",
    });
  } catch (error) {
    console.error("clinical OCR error", error instanceof Error ? error.message : "error");
    return fail("Document OCR could not be completed. Try a clearer PDF or image.", 422);
  }
}
