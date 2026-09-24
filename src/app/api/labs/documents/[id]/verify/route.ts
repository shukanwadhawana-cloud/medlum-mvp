import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";

/**
 * Human verification of OCR draft.
 * ACCEPT / CORRECT → may write LabOrder.result
 * MANUAL → clinician-entered result after OCR failure
 * REJECT → mark document unusable; do not write clinical result
 * OCR draft is preserved forever (machine evidence).
 */
const VERIFY_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const role = normalizeClinicRole(membership.role);
  if (!VERIFY_ROLES.has(role)) {
    return NextResponse.json({ success: false, error: "Not authorized to verify laboratory results." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "").toUpperCase();
  if (!["ACCEPT", "CORRECT", "MANUAL", "REJECT"].includes(action)) {
    return NextResponse.json({ success: false, error: "action must be ACCEPT, CORRECT, MANUAL, or REJECT" }, { status: 400 });
  }

  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
  });
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  if (doc.ocrStatus === "VERIFIED" || doc.ocrStatus === "REJECTED") {
    return NextResponse.json({ success: false, error: `Document already ${doc.ocrStatus}` }, { status: 409 });
  }
  if (doc.ocrStatus !== "DRAFT" && action !== "MANUAL" && action !== "REJECT") {
    return NextResponse.json({
      success: false,
      error: "Only DRAFT OCR output can be accepted or corrected. Run OCR first or reject as unusable.",
    }, { status: 409 });
  }

  let machine: Record<string, unknown> = {};
  try {
    machine = JSON.parse(doc.ocrDraft || "{}");
  } catch {
    machine = {};
  }
  const machineCandidates = (machine.candidates as Record<string, string>) || {};

  if (action === "REJECT") {
    const updated = await prisma.medicalDocument.update({
      where: { id: doc.id },
      data: {
        ocrStatus: "REJECTED",
        verifiedBy: session.doctorId,
        verifiedAt: new Date(),
        ocrDraft: JSON.stringify({
          ...machine,
          verified: false,
          rejected: true,
          rejectReason: String(body.reason || "").slice(0, 500),
          machineCandidates,
        }),
      },
    });
    await writeAudit({
      doctorId: session.doctorId,
      action: "LAB_DOCUMENT_OCR_REJECTED",
      entity: "MedicalDocument",
      entityId: doc.id,
      meta: { clinicId: membership.clinicId, reason: String(body.reason || "") },
    });
    return NextResponse.json({ success: true, document: updated, clinicalResultWritten: false });
  }

  const verifiedValues: Record<string, string> =
    action === "MANUAL"
      ? {}
      : action === "CORRECT" && body.values && typeof body.values === "object"
      ? Object.fromEntries(
          Object.entries(body.values as Record<string, unknown>)
            .map(([k, v]) => [String(k).slice(0, 80), String(v ?? "").trim().slice(0, 40)])
            .filter(([, v]) => v)
        )
      : { ...machineCandidates };

  if (Object.keys(verifiedValues).length === 0 && !body.resultText) {
    return NextResponse.json({
      success: false,
      error: "No values to verify. Provide corrected values or resultText.",
    }, { status: 400 });
  }

  const resultText =
    typeof body.resultText === "string" && body.resultText.trim()
      ? body.resultText.trim().slice(0, 4000)
      : Object.entries(verifiedValues)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");

  const now = new Date();
  const updated = await prisma.medicalDocument.update({
    where: { id: doc.id },
    data: {
      ocrStatus: "VERIFIED",
      verifiedBy: session.doctorId,
      verifiedAt: now,
      ocrDraft: JSON.stringify({
        ...machine,
        candidates: machineCandidates,
        verifiedValues,
        verified: true,
        verificationAction: action,
        machineExtracted: true,
        manualResult: action === "MANUAL"
          ? String(body.resultText || "").trim().slice(0, 4000)
          : undefined,
      }),
    },
  });

  let labOrder = null;
  if (doc.labOrderId) {
    labOrder = await prisma.labOrder.update({
      where: { id: doc.labOrderId },
      data: {
        result: resultText,
        status: "Completed",
        resultedAt: now,
      },
    });
  }

  await writeAudit({
    doctorId: session.doctorId,
    action:
      action === "CORRECT"
        ? "LAB_DOCUMENT_OCR_CORRECTED"
        : action === "MANUAL"
          ? "LAB_DOCUMENT_MANUAL_RESULT_VERIFIED"
          : "LAB_DOCUMENT_OCR_VERIFIED",
    entity: "MedicalDocument",
    entityId: doc.id,
    meta: {
      clinicId: membership.clinicId,
      labOrderId: doc.labOrderId,
      patientId: doc.patientId,
      machineCandidates,
      verifiedValues,
      action,
    },
  });

  return NextResponse.json({
    success: true,
    document: updated,
    labOrder,
    clinicalResultWritten: Boolean(labOrder),
    machineExtracted: machineCandidates,
    humanVerified: verifiedValues,
  });
}
