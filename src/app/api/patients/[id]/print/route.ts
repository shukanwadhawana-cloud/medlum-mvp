import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  canViewFullClinicalChart,
  findAuthorizedPatient,
  requireActiveClinicMembership,
} from "@/lib/clinic-auth";

/**
 * OPD clinical print package — same auth + tenant isolation as patient detail.
 * Clinical content only; clinician/orderer attribution is intentionally omitted.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) {
    return NextResponse.json({ error: "No active clinic membership." }, { status: 403 });
  }

  if (!canViewFullClinicalChart(membership.role)) {
    return NextResponse.json({ error: "Clinical chart access required to print OPD record." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const patient = await findAuthorizedPatient(membership, id);
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: {
      name: true,
      address: true,
      phone: true,
      email: true,
      registrationNo: true,
      letterheadHeightMm: true,
      showMedlumFooter: true,
    },
  });

  const [encounters, prescriptions, labOrders, diagnosticOrders, clinicalNotes, appointments] =
    await Promise.all([
      prisma.encounter.findMany({ where: { patientId: id }, orderBy: { createdAt: "asc" } }),
      prisma.prescription.findMany({
        where: { patientId: id, status: { not: "CANCELLED" } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.labOrder.findMany({ where: { patientId: id }, orderBy: { orderedAt: "asc" } }),
      prisma.diagnosticOrder.findMany({ where: { patientId: id }, orderBy: { orderedAt: "asc" } }),
      prisma.clinicalNote.findMany({
        where: {
          clinicId: membership.clinicId,
          patientId: id,
          status: { in: ["FINAL", "VERIFIED", "SUBMITTED"] },
        },
        include: {
          author: { select: { id: true } },
          verifier: { select: { id: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.appointment.findMany({ where: { patientId: id }, orderBy: { createdAt: "asc" } }),
    ]);

  const printable = {
    hospital: {
      name: clinic?.name || null,
      address: clinic?.address || null,
      phone: clinic?.phone || null,
      email: clinic?.email || null,
      registrationNo: clinic?.registrationNo || null,
      letterheadHeightMm: clinic?.letterheadHeightMm ?? null,
      showMedlumFooter: clinic?.showMedlumFooter ?? true,
    },
    patient: {
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phone,
      uhid: patient.uhid || null,
      registrationNo: patient.registrationNo || null,
      allergies: patient.allergies || null,
      notes: patient.notes || null,
      createdAt: patient.createdAt?.toISOString?.() || null,
    },
    encounters: encounters.map((e) => ({
      id: e.id,
      date: e.date,
      chiefComplaint: e.chiefComplaint || "",
      diagnosis: e.diagnosis || "",
      clinicalNotes: e.clinicalNotes || "",
      assessment: e.assessment || "",
      plan: e.plan || "",
      followUpDate: e.followUpDate || "",
      bp: e.bp || "",
      pulse: e.pulse || "",
      temperature: e.temperature || "",
      spo2: e.spo2 || "",
      rr: e.rr || "",
      weight: e.weight || "",
      height: e.height || "",
      createdAt: e.createdAt.toISOString(),
    })),
    prescriptions: prescriptions.map((r) => ({
      id: r.id,
      medicines: r.medicines || "",
      advice: r.advice || "",
      createdAt: r.createdAt.toISOString(),
    })),
    labOrders: labOrders.map((l) => ({
      id: l.id,
      testName: l.testName,
      category: l.category || "",
      status: l.status || "Ordered",
      result: l.result || "",
      notes: l.notes || "",
      orderedAt: l.orderedAt.toISOString(),
      resultedAt: l.resultedAt?.toISOString() || null,
    })),
    diagnosticOrders: diagnosticOrders.map((d) => ({
      id: d.id,
      studyName: d.studyName,
      modality: d.modality || "",
      bodyPart: d.bodyPart || "",
      indication: d.indication || "",
      status: d.status || "Ordered",
      findings: d.findings || "",
      impression: d.impression || "",
      notes: d.notes || "",
      orderedAt: d.orderedAt.toISOString(),
      reportedAt: d.reportedAt?.toISOString() || null,
    })),
    clinicalNotes: clinicalNotes
      .filter((n) => n.status === "FINAL" || n.status === "VERIFIED")
      .map((n) => ({
        id: n.id,
        noteType: n.noteType,
        title: n.title || "",
        content: n.content,
        status: n.status,
        finalizedAt: n.finalizedAt?.toISOString() || null,
        createdAt: n.createdAt.toISOString(),
      })),
    appointments: appointments.map((a) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      type: a.type,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    })),
  };

  return NextResponse.json(
    { printable },
    { headers: { "Cache-Control": "no-store" } }
  );
}
