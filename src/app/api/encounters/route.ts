import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

async function getClinicId(doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId }, select: { clinicId: true } });
  return membership?.clinicId || null;
}

async function getSharedPatient(patientId: string, doctorId: string) {
  const clinicId = await getClinicId(doctorId);
  return prisma.patient.findFirst({
    where: clinicId ? { id: patientId, OR: [{ clinicId }, { doctorId }] } : { id: patientId, doctorId },
  });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  if (patientId && !(await getSharedPatient(patientId, session.doctorId))) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const encounters = await prisma.encounter.findMany({
    where: patientId ? { patientId } : { doctorId: session.doctorId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ encounters });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    if (!patientId) return NextResponse.json({ success: false, error: "Patient required" }, { status: 400 });
    const patient = await getSharedPatient(patientId, session.doctorId);
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });

    let appointmentId: string | null = body.appointmentId ? String(body.appointmentId) : null;
    if (appointmentId) {
      // Clinic sharing does not grant write access to another consultant's appointment.
      const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, patientId, doctorId: session.doctorId } });
      if (!appt) appointmentId = null;
      else if (appt.status === "Scheduled") await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "Completed" } });
    }

    const encounter = await prisma.encounter.create({
      data: {
        doctorId: session.doctorId, patientId, appointmentId,
        date: String(body.date || new Date().toISOString().slice(0, 10)),
        chiefComplaint: String(body.chiefComplaint || ""), clinicalNotes: String(body.clinicalNotes || ""),
        diagnosis: String(body.diagnosis || ""), assessment: String(body.assessment || ""), plan: String(body.plan || ""),
        followUpDate: body.followUpDate ? String(body.followUpDate) : null,
        bp: String(body.bp || ""), pulse: String(body.pulse || ""), temperature: String(body.temperature || ""),
        spo2: String(body.spo2 || ""), weight: String(body.weight || ""), height: String(body.height || ""),
      },
    });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Encounter", entityId: encounter.id, meta: { patientId } });
    return NextResponse.json({ success: true, encounter });
  } catch (e) {
    console.error("create encounter", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
