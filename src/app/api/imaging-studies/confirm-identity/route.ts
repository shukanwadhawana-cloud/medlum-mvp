import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { findAuthorizedPatient, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { canEnterDiagnosticReport, canOrderLabs } from "@/lib/permissions";
import { findOrthancStudyByUid, getPacsConfig } from "@/lib/pacs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Explicit clinician confirmation for studies whose DICOM PatientID could not
 * be automatically matched to MedLum UHID/registrationNo. The study remains
 * unavailable to the viewer until this audited, clinic-scoped action succeeds.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canOrderLabs(membership.role) && !canEnterDiagnosticReport(membership.role)) {
    return NextResponse.json({ error: "Insufficient role permissions", code: "RBAC_DENIED" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const studyId = String(body.studyId || "").trim();
  if (!studyId || body.confirmed !== true) {
    return NextResponse.json(
      { error: "studyId and explicit identity confirmation are required", code: "CONFIRMATION_REQUIRED" },
      { status: 400 }
    );
  }

  const rows = await prisma.$queryRaw<{
    id: string;
    clinicId: string;
    patientId: string;
    diagnosticOrderId: string | null;
    studyInstanceUid: string;
    status: string;
    orthancId: string | null;
    modality: string;
  }[]>`SELECT id, "clinicId", "patientId", "diagnosticOrderId", "studyInstanceUid", status, "orthancId", modality
    FROM "ImagingStudy"
    WHERE id = ${studyId} AND "clinicId" = ${membership.clinicId}
    LIMIT 1`;
  const study = rows[0];
  if (!study) return NextResponse.json({ error: "Study not found" }, { status: 404 });
  if (study.status === "AVAILABLE" && study.orthancId) {
    return NextResponse.json({ success: true, alreadyConfirmed: true, status: "AVAILABLE" });
  }
  if (study.status !== "IDENTITY_UNVERIFIED" || !study.orthancId || !study.diagnosticOrderId) {
    return NextResponse.json(
      { error: "This study is not awaiting identity confirmation", code: "STUDY_NOT_AWAITING_CONFIRMATION" },
      { status: 409 }
    );
  }

  const patient = await findAuthorizedPatient(membership, study.patientId);
  if (!patient) return NextResponse.json({ error: "Study not found" }, { status: 404 });

  const members = await prisma.clinicMember.findMany({
    where: { clinicId: membership.clinicId, isActive: true },
    select: { doctorId: true },
  });
  const doctorIds = Array.from(new Set([session.doctorId, ...members.map((member) => member.doctorId)]));
  const order = await prisma.diagnosticOrder.findFirst({
    where: {
      id: study.diagnosticOrderId,
      patientId: patient.id,
      patient: {
        OR: [{ clinicId: membership.clinicId }, { clinicId: null, doctorId: { in: doctorIds } }],
      },
    },
    select: { id: true, status: true },
  });
  if (!order || String(order.status || "").toLowerCase() === "cancelled") {
    return NextResponse.json(
      { error: "The associated diagnostic order is unavailable or cancelled", code: "ORDER_UNAVAILABLE" },
      { status: 409 }
    );
  }

  const pacs = getPacsConfig();
  if (!pacs.enabled) {
    return NextResponse.json({ error: "PACS is not configured", code: "PACS_UNAVAILABLE" }, { status: 503 });
  }
  const verified = await findOrthancStudyByUid(study.studyInstanceUid, pacs);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.message, code: verified.code }, { status: 409 });
  }
  if (verified.match.orthancId !== study.orthancId) {
    return NextResponse.json(
      { error: "The Orthanc study identifier changed; identity confirmation was not applied", code: "ORTHANC_ID_MISMATCH" },
      { status: 409 }
    );
  }

  const updated = await prisma.$executeRaw`
    UPDATE "ImagingStudy"
    SET status = 'AVAILABLE', "updatedAt" = NOW()
    WHERE id = ${study.id}
      AND "clinicId" = ${membership.clinicId}
      AND "patientId" = ${patient.id}
      AND "diagnosticOrderId" = ${order.id}
      AND "orthancId" = ${study.orthancId}
      AND status = 'IDENTITY_UNVERIFIED'
  `;
  if (Number(updated) !== 1) {
    return NextResponse.json(
      { error: "Study changed during confirmation; refresh and retry", code: "STUDY_STATE_CHANGED" },
      { status: 409 }
    );
  }

  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "identity_confirmed",
    entity: "ImagingStudy",
    entityId: study.id,
    meta: {
      patientId: patient.id,
      diagnosticOrderId: order.id,
      method: "explicit_clinician_confirmation",
      identityMode: "unverified_at_import",
    },
  });

  return NextResponse.json(
    { success: true, status: "AVAILABLE", studyId: study.id },
    { headers: { "Cache-Control": "no-store" } }
  );
}
