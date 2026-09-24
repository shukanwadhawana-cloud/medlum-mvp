import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  canViewBillingDetail,
  canViewBillingSummary,
  canViewFullClinicalChart,
  findAuthorizedPatient,
  requireActiveClinicMembership,
} from "@/lib/clinic-auth";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) {
    return NextResponse.json({ error: "No active clinic membership." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const patient = await findAuthorizedPatient(membership, id);
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fullClinical = canViewFullClinicalChart(membership.role);
  const billingDetail = canViewBillingDetail(membership.role);
  const billingSummary = canViewBillingSummary(membership.role);

  const [appointments, latestEncounterVital, latestNursingVital] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.encounter.findFirst({
      where: {
        patientId: id,
        OR: [
          { bp: { not: "" } },
          { pulse: { not: "" } },
          { rr: { not: "" } },
          { spo2: { not: "" } },
          { temperature: { not: "" } },
          { weight: { not: "" } },
          { height: { not: "" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findFirst({
      where: { entity: "NursingVital", entityId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  let latestVitals: any = null;
  if (latestEncounterVital) {
    latestVitals = {
      bp: latestEncounterVital.bp,
      pulse: latestEncounterVital.pulse,
      rr: latestEncounterVital.rr,
      spo2: latestEncounterVital.spo2,
      temperature: latestEncounterVital.temperature,
      weight: latestEncounterVital.weight,
      height: latestEncounterVital.height,
      recordedAt: latestEncounterVital.createdAt.toISOString(),
      source: "OPD",
    };
  }
  if (latestNursingVital) {
    let meta: any = {};
    try { meta = JSON.parse(latestNursingVital.meta || "{}"); } catch {}
    const nursingVitals = {
      bp: String(meta.bp || ""),
      pulse: String(meta.pulse || ""),
      rr: String(meta.rr || ""),
      spo2: String(meta.spo2 || ""),
      temperature: String(meta.temperature || ""),
      recordedAt: latestNursingVital.createdAt.toISOString(),
      source: "IPD",
    };
    if (!latestVitals || new Date(nursingVitals.recordedAt).getTime() > new Date(latestVitals.recordedAt).getTime()) {
      latestVitals = nursingVitals;
    }
  }

  const base = {
    patient: {
      id: patient.id,
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phone,
      bp: patient.bp,
      allergies: patient.allergies,
      latestVitals,
      notes: fullClinical ? patient.notes : "",
      uhid: patient.uhid || "",
      registrationNo: patient.registrationNo || "",
      abhaNumber: patient.abhaNumber || "",
      abhaAddress: patient.abhaAddress || "",
      abhaStatus: patient.abhaStatus || "NOT_LINKED",
      abhaLinkedAt: patient.abhaLinkedAt ? patient.abhaLinkedAt.toISOString() : null,
      abhaVerifiedAt: patient.abhaVerifiedAt ? patient.abhaVerifiedAt.toISOString() : null,
      createdAt: patient.createdAt.toISOString(),
    },
    appointments: appointments.map((a) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      type: a.type,
      status: a.status,
      doctorId: a.doctorId,
      createdAt: a.createdAt.toISOString(),
    })),
    role: membership.role,
    access: {
      clinical: fullClinical,
      billing: billingDetail ? "detail" : billingSummary ? "summary" : "none",
    },
  };

  if (!fullClinical) {
    return NextResponse.json(
      {
        ...base,
        encounters: [],
        prescriptions: [],
        invoices: [],
        labOrders: [],
        diagnosticOrders: [],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const [encounters, prescriptions, invoices, labOrders, diagnosticOrders] = await Promise.all([
    prisma.encounter.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.prescription.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    billingSummary
      ? prisma.invoice.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    prisma.labOrder.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.diagnosticOrder.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json(
    {
      ...base,
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
        rr: e.rr,
        weight: e.weight,
        height: e.height,
        doctorId: e.doctorId,
        createdAt: e.createdAt.toISOString(),
      })),
      prescriptions: prescriptions.map((r) => ({
        id: r.id,
        medicines: r.medicines,
        advice: r.advice,
        encounterId: r.encounterId,
        doctorId: r.doctorId,
        createdAt: r.createdAt.toISOString(),
      })),
      invoices: invoices.map((i) =>
        billingDetail
          ? {
              id: i.id,
              amount: i.amount,
              status: i.status,
              note: i.note,
              doctorId: i.doctorId,
              createdAt: i.createdAt.toISOString(),
            }
          : {
              id: i.id,
              amount: i.amount,
              status: i.status,
              createdAt: i.createdAt.toISOString(),
            }
      ),
      labOrders: labOrders.map((l) => ({
        id: l.id,
        encounterId: l.encounterId,
        patientName: l.patientName,
        testName: l.testName,
        category: l.category,
        status: l.status,
        result: l.result,
        notes: l.notes,
        doctorId: l.doctorId,
        orderedAt: l.orderedAt.toISOString(),
        resultedAt: l.resultedAt?.toISOString() || null,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
      diagnosticOrders: diagnosticOrders.map((d) => ({
        id: d.id,
        encounterId: d.encounterId,
        patientName: d.patientName,
        studyName: d.studyName,
        modality: d.modality,
        bodyPart: d.bodyPart,
        indication: d.indication,
        status: d.status,
        findings: d.findings,
        impression: d.impression,
        notes: d.notes,
        doctorId: d.doctorId,
        orderedAt: d.orderedAt.toISOString(),
        performedAt: d.performedAt?.toISOString() || null,
        reportedAt: d.reportedAt?.toISOString() || null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
