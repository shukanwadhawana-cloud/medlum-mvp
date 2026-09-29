import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";

const ALLOWED_STATUS = new Set(["Ordered", "Performed", "Reported", "Cancelled"]);

async function getSharedPatient(patientId: string, doctorId: string, clinicId: string | null) {
  if (!clinicId) return null;
  return prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null, OR: [{ clinicId }, { clinicId: null, doctorId }] },
  });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  const patientId = new URL(req.url).searchParams.get("patientId");
  if (patientId && !(await getSharedPatient(patientId, session.doctorId, membership.clinicId))) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  const orders = await prisma.diagnosticOrder.findMany({
    where: patientId
      ? { patientId, patient: { OR: [{ clinicId: membership.clinicId }, { clinicId: null, doctorId: session.doctorId }] } }
      : { patient: { OR: [{ clinicId: membership.clinicId }, { clinicId: null, doctorId: session.doctorId }] } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { patientId, studyName, modality, bodyPart, indication, notes, encounterId } = body;
  if (!patientId || !studyName) {
    return NextResponse.json({ error: "Patient and study name are required" }, { status: 400 });
  }
  const patient = await getSharedPatient(String(patientId), session.doctorId, membership.clinicId);
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  let validEncounterId: string | null = null;
  if (encounterId) {
    const encounter = await prisma.encounter.findFirst({
      where: { id: String(encounterId), patientId: patient.id, doctorId: session.doctorId },
    });
    if (!encounter) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
    validEncounterId = encounter.id;
  }
  const order = await prisma.diagnosticOrder.create({
    data: {
      doctorId: session.doctorId,
      patientId: patient.id,
      encounterId: validEncounterId,
      patientName: patient.name,
      studyName: String(studyName).trim(),
      modality: String(modality || "Other").trim(),
      bodyPart: String(bodyPart || "").trim(),
      indication: String(indication || "").trim(),
      notes: String(notes || "").trim(),
    },
  });
  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "create",
    entity: "DiagnosticOrder",
    entityId: order.id,
    meta: { patientId: patient.id, studyName: order.studyName, modality: order.modality, encounterId: validEncounterId },
  });
  return NextResponse.json({ success: true, order });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { id, status, findings, impression, notes } = body;
  if (!id) return NextResponse.json({ error: "Diagnostic order id is required" }, { status: 400 });
  if (status && !ALLOWED_STATUS.has(String(status))) {
    return NextResponse.json({ error: "Invalid diagnostic status" }, { status: 400 });
  }
  const existing = await prisma.diagnosticOrder.findFirst({
    where: {\n      id: String(id),\n      patient: { OR: [{ clinicId: membership.clinicId }, { clinicId: null, doctorId: session.doctorId }] },\n    },
  });
  if (!existing) return NextResponse.json({ error: "Diagnostic order not found" }, { status: 404 });

  const nextStatus = status ? String(status) : existing.status;
  const nextFindings = findings !== undefined ? String(findings) : existing.findings;
  const nextImpression = impression !== undefined ? String(impression) : existing.impression;

  if (nextStatus === "Reported") {
    if (existing.status === "Reported") {
      return NextResponse.json({ error: "Study is already reported." }, { status: 409 });
    }
    if (!String(nextFindings || "").trim() || !String(nextImpression || "").trim()) {
      return NextResponse.json(
        { error: "Findings and impression are required before marking Reported." },
        { status: 400 }
      );
    }
  }

  const now = new Date();
  const order = await prisma.diagnosticOrder.update({
    where: { id: existing.id },
    data: {
      ...(status ? { status: nextStatus } : {}),
      ...(findings !== undefined ? { findings: String(findings) } : {}),
      ...(impression !== undefined ? { impression: String(impression) } : {}),
      ...(notes !== undefined ? { notes: String(notes) } : {}),
      ...(nextStatus === "Performed" && !existing.performedAt ? { performedAt: now } : {}),
      ...(nextStatus === "Reported" && !existing.reportedAt
        ? { reportedAt: now, performedAt: existing.performedAt || now }
        : {}),
    },
  });
  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "update",
    entity: "DiagnosticOrder",
    entityId: order.id,
    meta: {
      status: order.status,
      hasFindings: Boolean(order.findings),
      hasImpression: Boolean(order.impression),
    },
  });
  return NextResponse.json({ success: true, order });
}
