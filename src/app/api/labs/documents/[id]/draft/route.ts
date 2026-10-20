import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const DRAFT_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"]);

/**
 * Persist a browser-side Clinical Assist OCR pass as an unverified draft.
 * This endpoint never writes LabOrder.result; only the existing human-verification
 * endpoint can do that. All document access is scoped to the active clinic.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const role = normalizeClinicRole(membership.role);
  if (!DRAFT_ROLES.has(role)) {
    return NextResponse.json({ success: false, error: "Not authorized to process laboratory documents." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Invalid OCR draft payload." }, { status: 400 });
  }

  const rawTextPreview = typeof body.rawTextPreview === "string" ? body.rawTextPreview.trim().slice(0, 4000) : "";
  const method = typeof body.method === "string" ? body.method.slice(0, 100) : "Clinical Assist (on-device)";
  const confidence = typeof body.confidence === "number" && Number.isFinite(body.confidence)
    ? Math.max(0, Math.min(100, body.confidence))
    : null;
  const partial = body.partial === true;
  const incoming = body.candidates && typeof body.candidates === "object" && !Array.isArray(body.candidates)
    ? body.candidates as Record<string, unknown>
    : {};
  const candidates = Object.fromEntries(
    Object.entries(incoming)
      .slice(0, 100)
      .map(([key, value]) => [String(key).trim().slice(0, 80), String(value ?? "").trim().slice(0, 80)])
      .filter(([key, value]) => key.length > 0 && value.length > 0)
  );

  if (rawTextPreview.length < 20 && Object.keys(candidates).length === 0) {
    return NextResponse.json({ success: false, error: "Clinical Assist did not return enough readable text to save as a draft." }, { status: 422 });
  }

  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
  });
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  if (doc.ocrStatus === "VERIFIED" || doc.ocrStatus === "REJECTED") {
    return NextResponse.json({ success: false, error: `Document already ${doc.ocrStatus}; a new OCR pass cannot replace it.` }, { status: 409 });
  }

  const ocrStatus = Object.keys(candidates).length > 0 ? "DRAFT" : "FAILED";
  const warnings = [
    "Clinical Assist ran in this browser. These machine-extracted values are unverified and must be checked against the original report.",
    ...(partial ? ["Only the supported first pages were processed."] : []),
  ];
  const updated = await prisma.medicalDocument.update({
    where: { id: doc.id },
    data: {
      ocrStatus,
      ocrDraft: JSON.stringify({
        candidates,
        rawTextPreview,
        warnings,
        machineExtracted: true,
        verified: false,
        source: "clinical-assist-on-device",
        method,
        confidence,
        partial,
        retryAttemptedAt: new Date().toISOString(),
      }),
      ocrExtractedAt: new Date(),
    },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "LAB_DOCUMENT_CLINICAL_ASSIST_DRAFT",
    entity: "MedicalDocument",
    entityId: doc.id,
    meta: {
      clinicId: membership.clinicId,
      labOrderId: doc.labOrderId,
      patientId: doc.patientId,
      ocrStatus,
      candidateCount: Object.keys(candidates).length,
      method,
      confidence,
      partial,
    },
  });

  return NextResponse.json({
    success: true,
    document: updated,
    ocr: { status: ocrStatus, candidateCount: Object.keys(candidates).length, verified: false },
  });
}
