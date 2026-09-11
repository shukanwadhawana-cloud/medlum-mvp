import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const patient = await prisma.patient.findFirst({
    where: { id, doctorId: session.doctorId },
  });
  if (!patient) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [appointments, encounters, prescriptions, invoices] = await Promise.all([
    prisma.appointment.findMany({
      where: { doctorId: session.doctorId, patientId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.encounter.findMany({
      where: { doctorId: session.doctorId, patientId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.prescription.findMany({
      where: { doctorId: session.doctorId, patientId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.invoice.findMany({
      where: { doctorId: session.doctorId, patientId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({
    patient: {
      id: patient.id,
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phone,
      bp: patient.bp,
      allergies: patient.allergies,
      notes: patient.notes,
      createdAt: patient.createdAt.toISOString(),
    },
    appointments: appointments.map((a) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      type: a.type,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    })),
    encounters: encounters.map((e) => ({
      id: e.id,
      date: e.date,
      chiefComplaint: e.chiefComplaint,
      diagnosis: e.diagnosis,
      clinicalNotes: e.clinicalNotes,
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
    prescriptions: prescriptions.map((r) => ({
      id: r.id,
      medicines: r.medicines,
      advice: r.advice,
      encounterId: r.encounterId,
      createdAt: r.createdAt.toISOString(),
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      amount: i.amount,
      status: i.status,
      note: i.note,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}
