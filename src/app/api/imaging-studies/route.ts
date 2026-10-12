import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { findAuthorizedPatient, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { canEnterDiagnosticReport, canOrderLabs } from "@/lib/permissions";
import { buildOhifViewerUrl, getPacsConfig } from "@/lib/pacs";

const INGEST_STATUS = new Set(["PENDING", "AVAILABLE", "FAILED", "ARCHIVED"]);

async function clinicDoctorIds(clinicId: string, sessionDoctorId: string) {
  const members = await prisma.clinicMember.findMany({
    where: { clinicId, isActive: true },
    select: { doctorId: true },
  });
  return Array.from(new Set([sessionDoctorId, ...members.map((m) => m.doctorId)]));
}

function patientScope(clinicId: string, doctorIds: string[]) {
  return {
    OR: [{ clinicId }, { clinicId: null, doctorId: { in: doctorIds } }],
  };
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

  const doctorIds = await clinicDoctorIds(membership.clinicId, session.doctorId);
  const scope = patientScope(membership.clinicId, doctorIds);

  if (studyId && launch) {
    const study = await prisma.imagingStudy.findFirst({
      where: {
        id: String(studyId),
        clinicId: membership.clinicId,
        patient: scope,
      },
    });
    if (!study) return NextResponse.json({ error: "Study not found" }, { status: 404 });
    if (!pacs.enabled) {
      return NextResponse.json(
        { error: "PACS is not configured", code: "PACS_UNAVAILABLE", configured: false },
        { status: 503 }
      );
    }
    const viewerUrl = buildOhifViewerUrl(study.studyInstanceUid, pacs);
    if (!viewerUrl) {
      return NextResponse.json(
        { error: "Viewer is not configured", code: "VIEWER_UNAVAILABLE", configured: false },
        { status: 503 }
      );
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
      {
        success: true,
        study: {
          id: study.id,
          studyInstanceUid: study.studyInstanceUid,
          modality: study.modality,
          description: study.description,
          status: study.status,
        },
        viewerUrl,
        configured: true,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (patientId) {
    const patient = await findAuthorizedPatient(membership, patientId);
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const studies = await prisma.imagingStudy.findMany({
    where: {
      clinicId: membership.clinicId,
      ...(patientId ? { patientId: String(patientId) } : {}),
      ...(diagnosticOrderId ? { diagnosticOrderId: String(diagnosticOrderId) } : {}),
      patient: scope,
    },
    orderBy: { studyDate: "desc" },
    take: 100,
    select: {
      id: true,
      patientId: true,
      diagnosticOrderId: true,
      studyInstanceUid: true,
      accessionNumber: true,
      modality: true,
      description: true,
      studyDate: true,
      status: true,
      orthancId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      studies,
      pacs: { enabled: pacs.enabled, configured: pacs.enabled && Boolean(pacs.ohifBaseUrl) },
    },
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
  const {
    patientId,
    diagnosticOrderId,
    studyInstanceUid,
    accessionNumber,
    modality,
    description,
    studyDate,
    orthancId,
    status,
  } = body;

  if (!patientId || !studyInstanceUid) {
    return NextResponse.json({ error: "patientId and studyInstanceUid are required" }, { status: 400 });
  }
  const uid = String(studyInstanceUid).trim();
  if (!/^[0-9.]+$/.test(uid) || uid.length > 128) {
    return NextResponse.json({ error: "Invalid Study Instance UID" }, { status: 400 });
  }

  const patient = await findAuthorizedPatient(membership, String(patientId));
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  let orderId: string | null = null;
  if (diagnosticOrderId) {
    const doctorIds = await clinicDoctorIds(membership.clinicId, session.doctorId);
    const order = await prisma.diagnosticOrder.findFirst({
      where: {
        id: String(diagnosticOrderId),
        patientId: patient.id,
        patient: patientScope(membership.clinicId, doctorIds),
      },
    });
    if (!order) return NextResponse.json({ error: "Diagnostic order not found" }, { status: 404 });
    orderId = order.id;
  }

  const nextStatus = status && INGEST_STATUS.has(String(status)) ? String(status) : "AVAILABLE";

  const study = await prisma.imagingStudy.upsert({
    where: {
      clinicId_studyInstanceUid: {
        clinicId: membership.clinicId,
        studyInstanceUid: uid,
      },
    },
    create: {
      clinicId: membership.clinicId,
      patientId: patient.id,
      diagnosticOrderId: orderId,
      studyInstanceUid: uid,
      accessionNumber: String(accessionNumber || "").trim(),
      modality: String(modality || "OT").trim().slice(0, 16),
      description: String(description || "").trim().slice(0, 512),
      studyDate: studyDate ? new Date(studyDate) : null,
      orthancId: String(orthancId || "").trim().slice(0, 128),
      status: nextStatus,
      createdByDoctorId: session.doctorId,
    },
    update: {
      diagnosticOrderId: orderId ?? undefined,
      accessionNumber: accessionNumber !== undefined ? String(accessionNumber).trim() : undefined,
      modality: modality !== undefined ? String(modality).trim().slice(0, 16) : undefined,
      description: description !== undefined ? String(description).trim().slice(0, 512) : undefined,
      studyDate: studyDate !== undefined ? (studyDate ? new Date(studyDate) : null) : undefined,
      orthancId: orthancId !== undefined ? String(orthancId).trim().slice(0, 128) : undefined,
      status: status && INGEST_STATUS.has(String(status)) ? String(status) : undefined,
    },
  });

  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "upsert",
    entity: "ImagingStudy",
    entityId: study.id,
    meta: { patientId: patient.id, modality: study.modality, status: study.status },
  });

  return NextResponse.json({ success: true, study });
}
