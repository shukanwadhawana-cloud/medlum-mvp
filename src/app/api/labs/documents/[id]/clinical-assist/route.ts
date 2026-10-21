import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { normalizeClinicRole, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { extractCandidates } from "@/lib/lab-ocr";

export const runtime = "nodejs";

const RETRY_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"]);

/**
 * Saves Clinical Assist's on-device OCR as an editable draft only.
 * Client-supplied OCR is never trusted as a verified clinical result.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const role = normalizeClinicRole(membership.role);
  if (!RETRY_ROLES.has(role)) {
    return NextResponse.json({ success: false, error: "Not authorized to run laboratory extraction." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
  });
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  if (doc.ocrStatus !== "FAILED") {
    return NextResponse.json({ success: false, error: "Clinical Assist retry is available only for failed extraction documents." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const input: { text?: unknown; label?: unknown; confidence?: unknown; partial?: unknown; sourceChecksum?: unknown } =
    body && typeof body === "object"
      ? body as { text?: unknown; label?: unknown; confidence?: unknown; partial?: unknown; sourceChecksum?: unknown }
      : {};
  const text = typeof input.text === "string" ? input.text.trim().slice(0, 20_000) : "";
  if (text.length < 20) {
    return NextResponse.json({ success: false, error: "Clinical Assist returned too little readable text. Try a clearer, upright scan." }, { status: 422 });
  }

  const sourceChecksum = typeof input.sourceChecksum === "string"
    ? input.sourceChecksum.trim().toLowerCase()
    : "";
  if (!/^[a-f0-9]{64}$/.test(sourceChecksum)) {
    return NextResponse.json({ success: false, error: "A valid source-report fingerprint is required." }, { status: 400 });
  }
  if (!doc.checksum || doc.checksum.toLowerCase() !== sourceChecksum) {
    return NextResponse.json({
      success: false,
      error: "The selected file does not match this saved report. Choose the exact original file attached to this report; no draft was changed.",
    }, { status: 409 });
  }

  const label = typeof input.label === "string" ? input.label.slice(0, 100) : "Clinical Assist (on-device)";
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
    ? Math.max(0, Math.min(100, Math.round(input.confidence)))
    : null;
  const partial = input.partial === true;
  const candidates = extractCandidates(text);
  const hasCandidates = Object.keys(candidates).length > 0;
  const ocrStatus = hasCandidates ? "DRAFT" : "FAILED";
  const warnings = [
    `Clinical Assist ran in the browser on the user's device using ${label}.`,
    ...(confidence === null ? [] : [`Reported OCR confidence: ${confidence}% (not a clinical accuracy guarantee).`]),
    ...(partial ? ["Only the supported first pages of this PDF were processed."] : []),
    ...(!hasCandidates ? ["Readable text was extracted, but no supported lab-value labels could be mapped. Review the retained text and enter or correct results manually."] : []),
  ];
  const write = await prisma.medicalDocument.updateMany({
    where: { id: doc.id, clinicId: membership.clinicId, deletedAt: null, ocrStatus: "FAILED" },
    data: {
      ocrStatus,
      ocrDraft: JSON.stringify({
        candidates,
        rawTextPreview: text.slice(0, 4_000),
        warnings,
        machineExtracted: true,
        verified: false,
        extractionMethod: "clinical-assist-on-device",
        extractionLabel: label,
        confidence,
        partial,
        retryAttemptedAt: new Date().toISOString(),
      }),
      ocrExtractedAt: new Date(),
    },
  });
  // Do not overwrite a result if a different user has already verified/rejected it.
  if (write.count !== 1) {
    return NextResponse.json({ success: false, error: "This report changed while Clinical Assist was running. Reload it before retrying." }, { status: 409 });
  }
  const updated = await prisma.medicalDocument.findFirst({
    where: { id: doc.id, clinicId: membership.clinicId, deletedAt: null },
  });
  if (!updated) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

  await writeAudit({
    doctorId: session.doctorId,
    action: "LAB_DOCUMENT_CLINICAL_ASSIST_RETRY",
    entity: "MedicalDocument",
    entityId: doc.id,
    meta: {
      clinicId: membership.clinicId,
      labOrderId: doc.labOrderId,
      patientId: doc.patientId,
      ocrStatus,
      extractionMethod: "clinical-assist-on-device",
      confidence,
      candidateCount: Object.keys(candidates).length,
      partial,
    },
  });

  return NextResponse.json({
    success: true,
    document: updated,
    ocr: {
      status: ocrStatus,
      confidence,
      verified: false,
      message: hasCandidates
        ? `Clinical Assist extracted ${Object.keys(candidates).length} candidate lab value(s). Verify every value against the original report before accepting.`
        : "Clinical Assist extracted text, but did not map supported lab values. The text is retained below for review; no clinical result was written.",
    },
  });
}
