import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");

  const where: { doctorId: string; patientId?: string } = { doctorId: session.doctorId };
  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, doctorId: session.doctorId },
    });
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    where.patientId = patientId;
  }

  const encounters = await prisma.encounter.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    encounters: encounters.map((e) => ({
      id: e.id,
      doctorId: e.doctorId,
      patientId: e.patientId,
      appointmentId: e.appointmentId,
      date: e.date,
      chiefComplaint: e.chiefComplaint,
      clinicalNotes: e.clinicalNotes,
      diagnosis: e.diagnosis,
      assessment: e.assessment,
      plan: e.plan,
      followUpDate: e.followUpDate,
      bp: e.bp,
      pulse: e.pulse,
      temperature: e.temperature,
      spo2: e.spo2,
      weight: e.weight,
      height: e.height,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    if (!patientId) {
      return NextResponse.json({ success: false, error: "Patient required" }, { status: 400 });
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, doctorId: session.doctorId },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    let appointmentId: string | null = body.appointmentId ? String(body.appointmentId) : null;
    if (appointmentId) {
      const appt = await prisma.appointment.findFirst({
        where: { id: appointmentId, doctorId: session.doctorId, patientId },
      });
      if (!appt) appointmentId = null;
      else if (appt.status === "Scheduled") {
        await prisma.appointment.update({
          where: { id: appointmentId },
          data: { status: "Completed" },
        });
      }
    }

    const encounter = await prisma.encounter.create({
      data: {
        doctorId: session.doctorId,
        patientId,
        appointmentId,
        date: String(body.date || new Date().toISOString().slice(0, 10)),
        chiefComplaint: String(body.chiefComplaint || ""),
        clinicalNotes: String(body.clinicalNotes || ""),
        diagnosis: String(body.diagnosis || ""),
        assessment: String(body.assessment || ""),
        plan: String(body.plan || ""),
        followUpDate: body.followUpDate ? String(body.followUpDate) : null,
        bp: String(body.bp || ""),
        pulse: String(body.pulse || ""),
        temperature: String(body.temperature || ""),
        spo2: String(body.spo2 || ""),
        weight: String(body.weight || ""),
        height: String(body.height || ""),
      },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "create",
      entity: "Encounter",
      entityId: encounter.id,
      meta: { patientId },
    });

    return NextResponse.json({
      success: true,
      encounter: {
        id: encounter.id,
        doctorId: encounter.doctorId,
        patientId: encounter.patientId,
        appointmentId: encounter.appointmentId,
        date: encounter.date,
        chiefComplaint: encounter.chiefComplaint,
        clinicalNotes: encounter.clinicalNotes,
        diagnosis: encounter.diagnosis,
        assessment: encounter.assessment,
        plan: encounter.plan,
        followUpDate: encounter.followUpDate,
        bp: encounter.bp,
        pulse: encounter.pulse,
        temperature: encounter.temperature,
        spo2: encounter.spo2,
        weight: encounter.weight,
        height: encounter.height,
        createdAt: encounter.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("create encounter", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
