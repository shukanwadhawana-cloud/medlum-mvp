import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { hashClinicalNote } from "@/lib/clinical-signing";

async function getSharedPatient(patientId: string, doctorId: string) {
  const membership = await requireActiveClinicMembership(doctorId);
  if (!membership) return null;
  return prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null, OR: [{ clinicId: membership.clinicId }, { clinicId: null, doctorId }] },
  });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (patientId && !(await getSharedPatient(patientId, session.doctorId))) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const scope = { OR: [{ clinicId: membership.clinicId }, { clinicId: null, doctorId: session.doctorId }] };
  const encounters = await prisma.encounter.findMany({
    where: patientId ? { patientId, patient: scope } : { patient: scope },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ encounters });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const membership = await requireActiveClinicMembership(session.doctorId);
    if (!membership) return NextResponse.json({ success: false, error: "No active clinic membership" }, { status: 403 });
    const body = await req.json();
    const patientId = String(body.patientId || "");
    if (!patientId) return NextResponse.json({ success: false, error: "Patient required" }, { status: 400 });
    const patient = await getSharedPatient(patientId, session.doctorId);
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });

    let appointmentId: string | null = body.appointmentId ? String(body.appointmentId) : null;
    if (appointmentId) {
      const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, patientId, doctorId: session.doctorId } });
      if (!appt) appointmentId = null;
      else if (appt.status === "Scheduled") await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "Completed" } });
    }

    const date = String(body.date || new Date().toISOString().slice(0, 10));
    const clinicalNotes = String(body.clinicalNotes || "");
    const diagnosis = String(body.diagnosis || "");
    const assessment = String(body.assessment || "");
    const plan = String(body.plan || "");
    const chiefComplaint = String(body.chiefComplaint || "");
    const content = [
      chiefComplaint && `Chief complaint: ${chiefComplaint}`,
      clinicalNotes && `Clinical notes:\n${clinicalNotes}`,
      diagnosis && `Diagnosis: ${diagnosis}`,
      assessment && `Assessment:\n${assessment}`,
      plan && `Plan:\n${plan}`,
      body.followUpDate ? `Follow-up: ${String(body.followUpDate)}` : "",
      body.bp || body.pulse || body.temperature || body.spo2 || body.weight || body.height
        ? `Vitals: BP ${String(body.bp || "—")}; Pulse ${String(body.pulse || "—")}; Temp ${String(body.temperature || "—")}; SpO2 ${String(body.spo2 || "—")}; Weight ${String(body.weight || "—")}; Height ${String(body.height || "—")}`
        : "",
    ].filter(Boolean).join("\n\n").trim();
    const result = await prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.create({
        data: {
          doctorId: session.doctorId, patientId, appointmentId,
          date, chiefComplaint, clinicalNotes, diagnosis, assessment, plan,
          followUpDate: body.followUpDate ? String(body.followUpDate) : null,
          bp: String(body.bp || ""), pulse: String(body.pulse || ""), temperature: String(body.temperature || ""),
          spo2: String(body.spo2 || ""), weight: String(body.weight || ""), height: String(body.height || ""),
        },
      });
      const note = content
        ? await tx.clinicalNote.create({
            data: {
              clinicId: membership.clinicId,
              patientId,
              encounterId: encounter.id,
              authorDoctorId: session.doctorId,
              noteType: "Consultant Note",
              title: `Consultation ${date}`,
              content,
              status: "DRAFT",
              version: 1,
              contentHash: hashClinicalNote(content, 1),
            },
          })
        : null;
      return { encounter, note };
    });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Encounter", entityId: result.encounter.id, clinicId: membership.clinicId, meta: { patientId, clinicalNoteId: result.note?.id || null, signingStatus: result.note?.status || null } });
    return NextResponse.json({ success: true, encounter: result.encounter, clinicalNote: result.note });
  } catch (e) {
    console.error("create encounter", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
