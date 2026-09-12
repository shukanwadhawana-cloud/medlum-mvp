import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

async function getClinicId(doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId },
    select: { clinicId: true },
  });
  return membership?.clinicId || null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const clinicId = await getClinicId(session.doctorId);

  // A patient is now shared at clinic level. Keep the legacy doctorId fallback
  // so older records remain reachable even if their clinic link is missing.
  const patient = await prisma.patient.findFirst({
    where: clinicId
      ? { id, OR: [{ clinicId }, { doctorId: session.doctorId }] }
      : { id, doctorId: session.doctorId },
  });
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Once a consultant is authorized to the shared patient, return the complete
  // longitudinal chart regardless of which consultant created each event.
  const [appointments, encounters, prescriptions, invoices, labOrders, diagnosticOrders] = await Promise.all([
    prisma.appointment.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.encounter.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.prescription.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.invoice.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.labOrder.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.diagnosticOrder.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({
    patient: {
      id: patient.id, name: patient.name, age: patient.age, gender: patient.gender, phone: patient.phone,
      bp: patient.bp, allergies: patient.allergies, notes: patient.notes, createdAt: patient.createdAt.toISOString(),
    },
    appointments: appointments.map((a) => ({ id: a.id, date: a.date, time: a.time, type: a.type, status: a.status, doctorId: a.doctorId, createdAt: a.createdAt.toISOString() })),
    encounters: encounters.map((e) => ({
      id: e.id, date: e.date, chiefComplaint: e.chiefComplaint, diagnosis: e.diagnosis, clinicalNotes: e.clinicalNotes,
      assessment: e.assessment, plan: e.plan, followUpDate: e.followUpDate, bp: e.bp, pulse: e.pulse,
      temperature: e.temperature, spo2: e.spo2, weight: e.weight, height: e.height, doctorId: e.doctorId, createdAt: e.createdAt.toISOString(),
    })),
    prescriptions: prescriptions.map((r) => ({ id: r.id, medicines: r.medicines, advice: r.advice, encounterId: r.encounterId, doctorId: r.doctorId, createdAt: r.createdAt.toISOString() })),
    invoices: invoices.map((i) => ({ id: i.id, amount: i.amount, status: i.status, note: i.note, doctorId: i.doctorId, createdAt: i.createdAt.toISOString() })),
    labOrders: labOrders.map((l) => ({
      id: l.id, encounterId: l.encounterId, patientName: l.patientName, testName: l.testName, category: l.category,
      status: l.status, result: l.result, notes: l.notes, doctorId: l.doctorId, orderedAt: l.orderedAt.toISOString(),
      resultedAt: l.resultedAt?.toISOString() || null, createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString(),
    })),
    diagnosticOrders: diagnosticOrders.map((d) => ({
      id: d.id, encounterId: d.encounterId, patientName: d.patientName, studyName: d.studyName, modality: d.modality,
      bodyPart: d.bodyPart, indication: d.indication, status: d.status, findings: d.findings, impression: d.impression,
      notes: d.notes, doctorId: d.doctorId, orderedAt: d.orderedAt.toISOString(), performedAt: d.performedAt?.toISOString() || null,
      reportedAt: d.reportedAt?.toISOString() || null, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
