import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { findAuthorizedPatient, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { canEnterDiagnosticReport, canOrderLabs } from "@/lib/permissions";
import { findOrthancStudyByUid, getPacsConfig } from "@/lib/pacs";

/**
 * Trusted server-side verification: confirm the MedLum ImagingStudy exists in Orthanc
 * with a matching StudyInstanceUID, then mark AVAILABLE and store the Orthanc ID.
 * Browser clients cannot supply orthancId or force AVAILABLE.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canOrderLabs(membership.role) && !canEnterDiagnosticReport(membership.role)) {
    return NextResponse.json(
      { success: false, error: "Insufficient role permissions for this operation.", code: "RBAC_DENIED" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const studyId = String(body.studyId || body.id || "").trim();
  if (!studyId) {
    return NextResponse.json({ error: "studyId is required" }, { status: 400 });
  }

  const rows = await prisma.$queryRaw<
    {
      id: string;
      clinicId: string;
      patientId: string;
      studyInstanceUid: string;
      status: string;
      orthancId: string;
      modality: string;
    }[]
  >`SELECT id, "clinicId", "patientId", "studyInstanceUid", status, "orthancId", modality
    FROM "ImagingStudy"
    WHERE id = ${studyId} AND "clinicId" = ${membership.clinicId}
    LIMIT 1`;
  const study = rows[0];
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }

  const patient = await findAuthorizedPatient(membership, study.patientId);
  if (!patient) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }

  // Do not let ordinary PACS verification silently approve a study whose patient identity
  // could not be matched during import. Require the explicit clinician confirmation endpoint.
  if (study.status === "IDENTITY_UNVERIFIED") {
    return NextResponse.json(
      {
        error: "Patient identity requires explicit clinician confirmation before this study can be made available.",
        code: "IDENTITY_CONFIRMATION_REQUIRED",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Idempotent: already verified
  if (study.status === "AVAILABLE" && study.orthancId) {
    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "verify",
      entity: "ImagingStudy",
      entityId: study.id,
      meta: { result: "already_available", orthancIdPresent: true },
    });
    return NextResponse.json(
      {
        success: true,
        study: {
          id: study.id,
          status: study.status,
          orthancId: study.orthancId,
          studyInstanceUid: study.studyInstanceUid,
        },
        alreadyVerified: true,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const pacs = getPacsConfig();
  if (!pacs.enabled) {
    return NextResponse.json(
      { error: "PACS is not configured", code: "PACS_UNAVAILABLE", configured: false },
      { status: 503 }
    );
  }

  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "verify_attempt",
    entity: "ImagingStudy",
    entityId: study.id,
    meta: { studyInstanceUid: study.studyInstanceUid },
  });

  const result = await findOrthancStudyByUid(study.studyInstanceUid, pacs);
  if (!result.ok) {
    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "verify_failed",
      entity: "ImagingStudy",
      entityId: study.id,
      meta: { code: result.code },
    });
    const status =
      result.code === "STUDY_NOT_IN_PACS"
        ? 404
        : result.code === "PACS_TIMEOUT" || result.code === "PACS_UNREACHABLE"
          ? 503
          : result.code === "PACS_AUTH_FAILED"
            ? 502
            : 409;
    return NextResponse.json(
      { success: false, error: result.message, code: result.code },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Concurrency-safe: only transition from non-AVAILABLE (or empty orthancId)
  const updated = await prisma.$executeRaw`
    UPDATE "ImagingStudy"
    SET
      "orthancId" = ${result.match.orthancId},
      status = 'AVAILABLE',
      "updatedAt" = NOW()
    WHERE id = ${study.id}
      AND "clinicId" = ${membership.clinicId}
      AND (status IS DISTINCT FROM 'AVAILABLE' OR "orthancId" = '' OR "orthancId" IS NULL)
  `;

  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "verify",
    entity: "ImagingStudy",
    entityId: study.id,
    meta: {
      result: "available",
      orthancId: result.match.orthancId,
      rowsAffected: Number(updated),
    },
  });

  return NextResponse.json(
    {
      success: true,
      study: {
        id: study.id,
        status: "AVAILABLE",
        orthancId: result.match.orthancId,
        studyInstanceUid: study.studyInstanceUid,
        modality: study.modality,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
