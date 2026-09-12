import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const ALLOWED_STATUS = new Set(["Ordered", "Performed", "Reported", "Cancelled"]);

async function getClinicId(doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId }, select: { clinicId: true } });
  return membership?.clinicId || null;
}
async function getSharedPatient(patientId: string, doctorId: string) {
  const clinicId = await getClinicId(doctorId);
  return prisma.patient.findFirst({ where: clinicId ? { id: patientId, OR: [{ clinicId }, { doctorId }] } : { id: patientId, doctorId } });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const patientId = new URL(req.url).searchParams.get("patientId");
  if (patientId && !(await getSharedPatient(patientId, session.doctorId))) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  const orders = await prisma.diagnosticOrder.findMany({ where: patientId ? { patientId } : { doctorId: session.doctorId }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ orders });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { patientId, studyName, modality, bodyPart, indication, notes, encounterId } = body;
  if (!patientId || !studyName) return NextResponse.json({ error: "Patient and study name are required" }, { status: 400 });
  const patient = await getSharedPatient(String(patientId), session.doctorId);
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  let validEncounterId: string | null = null;
  if (encounterId) {
    const encounter = await prisma.encounter.findFirst({ where: { id: String(encounterId), patientId: patient.id } });
    if (!encounter) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
    validEncounterId = encounter.id;
  }
  const order = await prisma.diagnosticOrder.create({ data: { doctorId: session.doctorId, patientId: patient.id, encounterId: validEncounterId, patientName: patient.name, studyName: String(studyName).trim(), modality: String(modality || "Other").trim(), bodyPart: String(bodyPart || "").trim(), indication: String(indication || "").trim(), notes: String(notes || "").trim() } });
  await prisma.auditLog.create({ data: { doctorId: session.doctorId, action: "CREATE", entity: "DiagnosticOrder", entityId: order.id, meta: JSON.stringify({ patientId: patient.id, studyName: order.studyName, modality: order.modality }) } });
  return NextResponse.json({ success: true, order });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id, status, findings, impression, notes } = body;
  if (!id) return NextResponse.json({ error: "Diagnostic order id is required" }, { status: 400 });
  if (status && !ALLOWED_STATUS.has(String(status))) return NextResponse.json({ error: "Invalid diagnostic status" }, { status: 400 });
  const existing = await prisma.diagnosticOrder.findFirst({ where: { id: String(id), doctorId: session.doctorId } });
  if (!existing) return NextResponse.json({ error: "Diagnostic order not found" }, { status: 404 });
  const nextStatus = status ? String(status) : existing.status;
  const now = new Date();
  const order = await prisma.diagnosticOrder.update({ where: { id: existing.id }, data: { ...(status ? { status: nextStatus } : {}), ...(findings !== undefined ? { findings: String(findings) } : {}), ...(impression !== undefined ? { impression: String(impression) } : {}), ...(notes !== undefined ? { notes: String(notes) } : {}), ...(nextStatus === "Performed" && !existing.performedAt ? { performedAt: now } : {}), ...(nextStatus === "Reported" && !existing.reportedAt ? { reportedAt: now, performedAt: existing.performedAt || now } : {}) } });
  await prisma.auditLog.create({ data: { doctorId: session.doctorId, action: "UPDATE", entity: "DiagnosticOrder", entityId: order.id, meta: JSON.stringify({ status: order.status }) } });
  return NextResponse.json({ success: true, order });
}
