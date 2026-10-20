import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { extractCandidates } from "@/lib/lab-ocr";

export const runtime = "nodejs";

const REPORT_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"]);

/** Saves on-device Clinical Assist OCR as an unverified lab draft, never as a clinical result. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const role = normalizeClinicRole(membership.role);
  if (!REPORT_ROLES.has(role)) {
    return NextResponse.json({ success: false, error: "Not authorized to run laboratory extraction." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
  });
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  if (doc.ocrStatus !== "FAILED") {
    return NextResponse.json({ success: false, error: "Clinical Assist is available only for failed extraction drafts." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "A valid OCR payload is required." }, { status: 400 });
  }
  const payload = body as { text?: unknown; confidence?: unknown; method?: unknown; partial?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim().slice(0, 20_000) : "";
  if (text.length < 20) {
    return NextResponse.json({ success: false, error: "Clinical Assist did not return enough readable text. Try a clearer report." }, { status: 422 });
  }

  const candidates = extractCandidates(text);
  const ocrStatus = Object.keys(candidates).length > 0 ? "DRAFT" : "FAILED";
  const confidence = typeof payload.confidence === "number" && Number.isFinite(payload.confidence)
    ? Math.max(0, Math.min(100, Math.round(payload.confidence)))
    : null;
  const method = typeof payload.method === "string" ? payload.method.slice(0, 80) : "clinical-assist-on-device";
  const warnings = [
    "Clinical Assist OCR ran on the clinician's device. Verify every candidate against the original report.",
    ...(payload.partial === true ? ["Only the supported first pages of this PDF were processed."] : []),
  ];
  const updated = await prisma.medicalDocument.update({
    where: { id: doc.id },
    data: {
      ocrStatus,
      ocrDraft: JSON.stringify({
        candidates,
        rawTextPreview: text.slice(0, 4_000),
        warnings,
        machineExtracted: true,
        clinicalAssist: true,
        extractionMethod: method,
        confidence,
        verified: false,
        retryAttemptedAt: new Date().toISOString(),
      }),
      ocrExtractedAt: new Date(),
    },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "LAB_DOCUMENT_CLINICAL_ASSIST",
    entity: "MedicalDocument",
    entityId: doc.id,
    meta: { clinicId: membership.clinicId, labOrderId: doc.labOrderId, patientId: doc.patientId, ocrStatus, candidateCount: Object.keys(candidates).length, method, confidence },
  });

  return NextResponse.json({
    success: true,
    document: updated,
    ocr: { status: ocrStatus, candidateCount: Object.keys(candidates).length, method, confidence, verified: false },
  }, { headers: { "Cache-Control": "no-store" } });
}
