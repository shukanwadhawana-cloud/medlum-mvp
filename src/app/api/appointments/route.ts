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
  return prisma.patient.findFirst({ where: clinicId ? { id: patientId, OR: [{ clinicId }, { doctorId }] } : { id: patientId, doctorId } });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = await getClinicId(session.doctorId);
  const appointments = clinicId
    ? await prisma.appointment.findMany({ where: { doctor: { clinicMembers: { some: { clinicId } } } }, orderBy: [{ date: "asc" }, { time: "asc" }] })
    : await prisma.appointment.findMany({ where: { doctorId: session.doctorId }, orderBy: [{ date: "asc" }, { time: "asc" }] });
  return NextResponse.json({ appointments }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    const patientName = String(body.patientName || "");
    const date = String(body.date || "");
    const time = String(body.time || "");
    const type = String(body.type || "Consultation");
    if (!patientId || !date || !time) return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
    const patient = await getSharedPatient(patientId, session.doctorId);
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    const appt = await prisma.appointment.create({ data: { doctorId: session.doctorId, patientId, patientName: patientName || patient.name, date, time, type, status: "Scheduled" } });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Appointment", entityId: appt.id });
    return NextResponse.json({ success: true, appointment: appt });
  } catch (e) {
    console.error("create appt", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!id || !status) return NextResponse.json({ success: false, error: "id and status required" }, { status: 400 });
    const clinicId = await getClinicId(session.doctorId);
    const existing = clinicId
      ? await prisma.appointment.findFirst({ where: { id, doctor: { clinicMembers: { some: { clinicId } } } } })
      : await prisma.appointment.findFirst({ where: { id, doctorId: session.doctorId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    const updated = await prisma.appointment.update({ where: { id }, data: { status } });
    await writeAudit({ doctorId: session.doctorId, action: "update_status", entity: "Appointment", entityId: id, meta: { status } });
    return NextResponse.json({ success: true, appointment: updated });
  } catch (e) {
    console.error("patch appt", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
