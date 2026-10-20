import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { extractCandidates } from "@/lib/lab-ocr";

export const runtime = "nodejs";

const ASSIST_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"]);
const MAX_TEXT_CHARS = 20_000;

/**
 * Persist a browser-side Clinical Assist extraction as an unverified draft.
 * The uploaded file is not re-sent or stored here; only bounded OCR text is accepted.
 * This endpoint can only update a FAILED document inside the caller's active clinic.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const role = normalizeClinicRole(membership.role);
  if (!ASSIST_ROLES.has(role)) {
    return NextResponse.json({ success: false, error: "Not authorized to run laboratory Clinical Assist." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
    select: { id: true, clinicId: true, patientId: true, labOrderId: true, ocrStatus: true },
  });
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  if (doc.ocrStatus !== "FAILED") {
    return NextResponse.json({ success: false, error: "Clinical Assist fallback is available only for failed extraction." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < 8) {
    return NextResponse.json({ success: false, error: "Clinical Assist did not recover enough readable text. Try a sharper, upright image or a PDF." }, { status: 422 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ success: false, error: "Extracted text exceeded the supported size." }, { status: 413 });
  }

  const label = typeof body?.label === "string" ? body.label.slice(0, 120) : "Clinical Assist (on-device)";
  const confidence = typeof body?.confidence === "number" && Number.isFinite(body.confidence)
    ? Math.max(0, Math.min(100, Math.round(body.confidence)))
    : null;
  const partial = body?.partial === true;
  const candidates = extractCandidates(text);
  const status = Object.keys(candidates).length > 0 ? "DRAFT" : "FAILED";
  const message = status === "DRAFT"
    ? "Clinical Assist prepared an editable lab-result draft. Check every value and unit against the original report before verifying."
    : "Clinical Assist extracted text but could not safely map supported lab values. Review the retained text and enter/correct the findings manually.";
  const warnings = [
    "Text extracted in the browser using Clinical Assist; values are machine-generated and not clinically verified.",
    ...(confidence === null ? [] : ["On-device OCR confidence: " + confidence + "% (not a measure of clinical correctness)."]),
    ...(partial ? ["Only the supported first pages of this PDF were processed."] : []),
  ];
  const ocrDraft = JSON.stringify({
    candidates,
    rawTextPreview: text.slice(0, 4000),
    warnings,
    message,
    machineExtracted: true,
    clientAssist: true,
    extractionMethod: label,
    confidence,
    partial,
    verified: false,
    retryAttemptedAt: new Date().toISOString(),
  });

  // Compare-and-set prevents a late browser OCR response from overwriting a
  // document already verified/rejected by a clinician in another session.
  const changed = await prisma.medicalDocument.updateMany({
    where: {
      id: doc.id,
      clinicId: membership.clinicId,
      deletedAt: null,
      ocrStatus: "FAILED",
      verifiedAt: null,
    },
    data: {
      ocrStatus: status,
      ocrDraft,
      ocrExtractedAt: new Date(),
    },
  });
  if (changed.count !== 1) {
    return NextResponse.json({ success: false, error: "The report status changed during extraction. Refresh before trying again." }, { status: 409 });
  }

  const updated = await prisma.medicalDocument.findFirst({
    where: { id: doc.id, clinicId: membership.clinicId, deletedAt: null },
  });
  if (!updated) return NextResponse.json({ success: false, error: "Document could not be reloaded" }, { status: 500 });

  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "LAB_DOCUMENT_CLINICAL_ASSIST_CLIENT_OCR",
    entity: "MedicalDocument",
    entityId: doc.id,
    meta: {
      labOrderId: doc.labOrderId,
      patientId: doc.patientId,
      ocrStatus: status,
      candidateCount: Object.keys(candidates).length,
      extractionMethod: label,
      confidence,
      partial,
    },
  });

  return NextResponse.json({
    success: true,
    document: updated,
    ocr: { status, message, verified: false, candidateCount: Object.keys(candidates).length },
  });
}
