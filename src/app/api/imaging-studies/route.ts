import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { findAuthorizedPatient, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { canEnterDiagnosticReport, canOrderLabs } from "@/lib/permissions";
import { buildOhifViewerUrl, getPacsConfig } from "@/lib/pacs";
import { randomBytes } from "node:crypto";

function newId() {
  return `img_${randomBytes(12).toString("hex")}`;
}

async function clinicDoctorIds(clinicId: string, sessionDoctorId: string) {
  const members = await prisma.clinicMember.findMany({
    where: { clinicId, isActive: true },
    select: { doctorId: true },
  });
  return Array.from(new Set([sessionDoctorId, ...members.map((m) => m.doctorId)]));
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canEnterDiagnosticReport(membership.role)) {
    return NextResponse.json(
      { success: false, error: "Insufficient role permissions for this operation.", code: "RBAC_DENIED" },
      { status: 403 }
    );
  }

  const pacs = getPacsConfig();
  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const diagnosticOrderId = url.searchParams.get("diagnosticOrderId");
  const studyId = url.searchParams.get("id");
  const launch = url.searchParams.get("launch") === "1";

  if (patientId) {
    const patient = await findAuthorizedPatient(membership, patientId);
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  if (studyId && launch) {
    const rows = await prisma.$queryRaw<
      { id: string; patientId: string; studyInstanceUid: string; modality: string; description: string; status: string; orthancId: string }[]
    >`SELECT id, "patientId", "studyInstanceUid", modality, description, status, "orthancId"
      FROM "ImagingStudy"
      WHERE id = ${String(studyId)} AND "clinicId" = ${membership.clinicId}
      LIMIT 1`;
    const study = rows[0];
    if (!study) return NextResponse.json({ error: "Study not found" }, { status: 404 });
    const patient = await findAuthorizedPatient(membership, study.patientId);
    if (!patient) return NextResponse.json({ error: "Study not found" }, { status: 404 });
    if (study.status !== "AVAILABLE" || !study.orthancId) {
      return NextResponse.json(
        { error: "Imaging study is not verified in PACS yet", code: "STUDY_NOT_READY", status: study.status },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!pacs.enabled) {
      return NextResponse.json({ error: "PACS is not configured", code: "PACS_UNAVAILABLE", configured: false }, { status: 503 });
    }
    const viewerUrl = buildOhifViewerUrl(study.studyInstanceUid, pacs);
    if (!viewerUrl) {
      return NextResponse.json({ error: "Viewer is not configured", code: "VIEWER_UNAVAILABLE", configured: false }, { status: 503 });
    }
    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "view",
      entity: "ImagingStudy",
      entityId: study.id,
      meta: { patientId: study.patientId, modality: study.modality },
    });
    return NextResponse.json(
      { success: true, study, viewerUrl, configured: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const studies = await prisma.$queryRaw<
    {
      id: string;
      patientId: string;
      diagnosticOrderId: string | null;
      studyInstanceUid: string;
      accessionNumber: string;
      modality: string;
      description: string;
      studyDate: Date | null;
      status: string;
      orthancId: string;
      createdAt: Date;
      updatedAt: Date;
    }[]
  >`SELECT s.id, s."patientId", s."diagnosticOrderId", s."studyInstanceUid", s."accessionNumber",
           s.modality, s.description, s."studyDate", s.status, s."orthancId", s."createdAt", s."updatedAt"
    FROM "ImagingStudy" s
    INNER JOIN "Patient" p ON p.id = s."patientId"
    WHERE s."clinicId" = ${membership.clinicId}
      AND (${patientId}::text IS NULL OR s."patientId" = ${patientId})
      AND (${diagnosticOrderId}::text IS NULL OR s."diagnosticOrderId" = ${diagnosticOrderId})
      AND (p."clinicId" = ${membership.clinicId} OR p."clinicId" IS NULL)
    ORDER BY s."studyDate" DESC NULLS LAST
    LIMIT 100`;

  return NextResponse.json(
    { studies, pacs: { enabled: pacs.enabled, configured: pacs.enabled && Boolean(pacs.ohifBaseUrl) } },
    { headers: { "Cache-Control": "no-store" } }
  );
}

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
  const patientId = String(body.patientId || "");
  const uid = String(body.studyInstanceUid || "").trim();
  if (!patientId || !uid) {
    return NextResponse.json({ error: "patientId and studyInstanceUid are required" }, { status: 400 });
  }
  if (uid.length > 64 || !/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/.test(uid)) {
    return NextResponse.json({ error: "Invalid Study Instance UID" }, { status: 400 });
  }

  const patient = await findAuthorizedPatient(membership, patientId);
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  let orderId: string | null = null;
  if (body.diagnosticOrderId) {
    const doctorIds = await clinicDoctorIds(membership.clinicId, session.doctorId);
    const order = await prisma.diagnosticOrder.findFirst({
      where: {
        id: String(body.diagnosticOrderId),
        patientId: patient.id,
        patient: {
          OR: [{ clinicId: membership.clinicId }, { clinicId: null, doctorId: { in: doctorIds } }],
        },
      },
    });
    if (!order) return NextResponse.json({ error: "Diagnostic order not found" }, { status: 404 });
    orderId = order.id;
  }

  // Metadata submission is not proof that pixels exist in Orthanc. Only a verified server-side ingest flow may mark a study available.
  const status = "PENDING";
  const id = newId();
  const modality = String(body.modality || "OT").trim().slice(0, 16);
  const description = String(body.description || "").trim().slice(0, 512);
  const accessionNumber = String(body.accessionNumber || "").trim().slice(0, 64);
  // Never accept an Orthanc object ID from the browser; it must come from a trusted ingest/verification flow.
  const orthancId = "";
  const studyDate = body.studyDate ? new Date(body.studyDate) : null;
  if (studyDate && Number.isNaN(studyDate.getTime())) {
    return NextResponse.json({ error: "Invalid studyDate" }, { status: 400 });
  }

  // On conflict: never let browser input clear a verified orthancId or demote AVAILABLE status.
  await prisma.$executeRaw`
    INSERT INTO "ImagingStudy" (
      id, "clinicId", "patientId", "diagnosticOrderId", "studyInstanceUid",
      "accessionNumber", modality, description, "studyDate", "orthancId",
      status, "createdByDoctorId", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${membership.clinicId}, ${patient.id}, ${orderId}, ${uid},
      ${accessionNumber}, ${modality}, ${description}, ${studyDate}, ${orthancId},
      ${status}, ${session.doctorId}, NOW(), NOW()
    )
    ON CONFLICT ("clinicId", "studyInstanceUid") DO UPDATE SET
      "diagnosticOrderId" = COALESCE(EXCLUDED."diagnosticOrderId", "ImagingStudy"."diagnosticOrderId"),
      modality = EXCLUDED.modality,
      description = EXCLUDED.description,
      "accessionNumber" = EXCLUDED."accessionNumber",
      "studyDate" = COALESCE(EXCLUDED."studyDate", "ImagingStudy"."studyDate"),
      "updatedAt" = NOW()
  `;

  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "upsert",
    entity: "ImagingStudy",
    entityId: id,
    meta: { patientId: patient.id, modality, status },
  });

  return NextResponse.json({
    success: true,
    study: {
      id,
      clinicId: membership.clinicId,
      patientId: patient.id,
      diagnosticOrderId: orderId,
      studyInstanceUid: uid,
      modality,
      description,
      status,
    },
  });
}
