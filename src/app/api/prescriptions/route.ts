import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

async function getClinicId(doctorId: string) {
  const membership = await requireActiveClinicMembership(doctorId);
  return membership?.clinicId || null;
}
async function getSharedPatient(patientId: string, doctorId: string) {
  const clinicId = await getClinicId(doctorId);
  if (!clinicId) return null;
  return prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null, OR: [{ clinicId }, { clinicId: null, doctorId }] },
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  const list = await prisma.prescription.findMany({
    where: { patient: { clinicId: membership.clinicId } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ prescriptions: list });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    const medicines = String(body.medicines || "").trim();
    const advice = String(body.advice || "");
    const encounterId = body.encounterId ? String(body.encounterId) : null;
    if (!patientId || !medicines) return NextResponse.json({ success: false, error: "Patient and medicines required" }, { status: 400 });
    const patient = await getSharedPatient(patientId, session.doctorId);
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    if (encounterId) {
      const enc = await prisma.encounter.findFirst({ where: { id: encounterId, patientId, doctorId: session.doctorId } });
      if (!enc) return NextResponse.json({ success: false, error: "Encounter not found" }, { status: 404 });
    }
    const rx = await prisma.prescription.create({ data: { doctorId: session.doctorId, patientId, patientName: patient.name, encounterId, medicines, advice } });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Prescription", entityId: rx.id });
    return NextResponse.json({ success: true, prescription: rx });
  } catch (e) {
    console.error("create rx", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
