import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { extractCandidates } from "@/lib/lab-ocr";

export const runtime = "nodejs";

const EXTRACTION_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"]);

/**
 * Accept text extracted by Clinical Assist in the user's browser and map it to lab
 * value candidates. This endpoint never writes LabOrder.result: it only updates the
 * MedicalDocument draft, which must still be verified through the existing verify API.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const role = normalizeClinicRole(membership.role);
  if (!EXTRACTION_ROLES.has(role)) {
    return NextResponse.json({ success: false, error: "Not authorized to run laboratory extraction." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
  if (rawText.length < 20) {
    return NextResponse.json({ success: false, error: "Extracted text is too short to review." }, { status: 400 });
  }
  if (rawText.length > 20_000) {
    return NextResponse.json({ success: false, error: "Extracted text exceeds the 20,000-character limit." }, { status: 413 });
  }

  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
  });
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  if (doc.ocrStatus !== "FAILED") {
    return NextResponse.json({
      success: false,
      error: "Clinical Assist can be used here only while the document extraction status is FAILED.",
    }, { status: 409 });
  }

  const candidates = extractCandidates(rawText);
  const status = Object.keys(candidates).length > 0 ? "DRAFT" : "FAILED";
  const method = typeof body.method === "string" ? body.method.slice(0, 80) : "Clinical Assist OCR";
  const confidence = typeof body.confidence === "number" && Number.isFinite(body.confidence)
    ? Math.max(0, Math.min(100, Math.round(body.confidence)))
    : null;
  const partial = body.partial === true;
  const updated = await prisma.medicalDocument.update({
    where: { id: doc.id },
    data: {
      ocrStatus: status,
      ocrDraft: JSON.stringify({
        candidates,
        rawTextPreview: rawText.slice(0, 4_000),
        warnings: [
          "Text was extracted by Clinical Assist in the user's browser. All values require source-document verification.",
          ...(partial ? ["Only the supported first pages of the PDF were processed."] : []),
        ],
        machineExtracted: true,
        verified: false,
        extractionSource: "clinical-assist-browser",
        extractionMethod: method,
        extractionConfidence: confidence,
        partial,
        retryAttemptedAt: new Date().toISOString(),
      }),
      ocrExtractedAt: new Date(),
    },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "LAB_DOCUMENT_CLINICAL_ASSIST_EXTRACTION",
    entity: "MedicalDocument",
    entityId: doc.id,
    meta: {
      clinicId: membership.clinicId,
      labOrderId: doc.labOrderId,
      patientId: doc.patientId,
      status,
      candidateCount: Object.keys(candidates).length,
      method,
      confidence,
      partial,
    },
  });

  return NextResponse.json({
    success: true,
    document: updated,
    ocr: {
      status,
      candidateCount: Object.keys(candidates).length,
      method,
      confidence,
      partial,
      verified: false,
      message: status === "DRAFT"
        ? "Lab value candidates were extracted as a draft. Review them before verification."
        : "Readable text was retained, but no supported lab value candidates were mapped. Manual review is still available.",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
