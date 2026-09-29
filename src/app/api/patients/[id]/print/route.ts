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
 * Patient-facing: no staff login codes or internal facility roles on the printout.
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
      invoiceFooter: true,
    },
  });

  const [encounters, prescriptions, labOrders, diagnosticOrders, clinicalNotes, appointments] =
    await Promise.all([
      prisma.encounter.findMany({
        where: { patientId: id, patient: { clinicId: membership.clinicId } },
        include: { doctor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.prescription.findMany({
        where: { patientId: id, patient: { clinicId: membership.clinicId }, status: { not: "CANCELLED" } },
        include: { doctor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.labOrder.findMany({
        where: { patientId: id, patient: { clinicId: membership.clinicId } },
        include: { doctor: { select: { id: true, name: true } } },
        orderBy: { orderedAt: "asc" },
      }),
      prisma.diagnosticOrder.findMany({
        where: { patientId: id, patient: { clinicId: membership.clinicId } },
        include: { doctor: { select: { id: true, name: true } } },
        orderBy: { orderedAt: "asc" },
      }),
      prisma.clinicalNote.findMany({
        where: { patientId: id, clinicId: membership.clinicId },
        include: {
          author: { select: { id: true, name: true } },
          verifier: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.appointment.findMany({
        where: { patientId: id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const doctorIds = Array.from(
    new Set([
      ...encounters.map((e) => e.doctorId),
      ...prescriptions.map((r) => r.doctorId),
      ...labOrders.map((l) => l.doctorId),
      ...diagnosticOrders.map((d) => d.doctorId),
      ...clinicalNotes.flatMap((n) => [n.authorDoctorId, n.verifierDoctorId].filter(Boolean)),
    ])
  );
  const staff = doctorIds.length
    ? await prisma.clinicMember.findMany({
        where: { clinicId: membership.clinicId, doctorId: { in: doctorIds as string[] } },
        select: { doctorId: true, role: true, designation: true, staffCode: true },
      })
    : [];
  const staffByDoctor = new Map(staff.map((m) => [m.doctorId, m]));

  // Patient-facing print: never expose staff login codes or Owner/Admin roles.
  const clinicianLabel = (doctor: { id: string; name: string } | null | undefined) => {
    if (!doctor) return null;
    const member = staffByDoctor.get(doctor.id);
    const designation = (member?.designation || "").trim();
    const role = (member?.role || "").trim();
    const clinicalTitle =
      designation && !/^(Owner|Admin|Manager|Staff|Receptionist)$/i.test(designation)
        ? designation
        : role && !/^(Owner|Admin|Manager|Staff|Receptionist)$/i.test(role)
          ? role
          : null;
    return {
      name: doctor.name,
      role: clinicalTitle,
      staffCode: null as string | null,
    };
  };

  const APPT_MARKER = "__MEDLUM_CONSULTANT__";
  const parseAppointmentType = (raw: string) => {
    const parts = String(raw || "").split(`|${APPT_MARKER}|`);
    const type = (parts[0] || raw || "Appointment").trim();
    const meta = Object.fromEntries(
      String(parts[1] || "")
        .split("|")
        .filter(Boolean)
        .map((x: string) => {
          const i = x.indexOf("=");
          return i > 0 ? [x.slice(0, i), x.slice(i + 1)] : [x, ""];
        })
    );
    return {
      type: type.replace(/\|/g, " · ").trim() || "Appointment",
      consultantName: String(meta.name || "").trim(),
      consultantSpecialty: String(meta.specialty || "").trim(),
      notes: String(meta.notes || "").trim(),
    };
  };

  const printable = {
    hospital: {
      name: clinic?.name || null,
      address: clinic?.address || null,
      phone: clinic?.phone || null,
      email: clinic?.email || null,
      registrationNo: clinic?.registrationNo || null,
      letterheadHeightMm: clinic?.letterheadHeightMm ?? null,
      showMedlumFooter: clinic?.showMedlumFooter ?? true,
      invoiceFooter: clinic?.invoiceFooter || "",
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
      clinician: clinicianLabel(e.doctor),
    })),
    prescriptions: prescriptions.map((r) => ({
      id: r.id,
      medicines: r.medicines || "",
      advice: r.advice || "",
      createdAt: r.createdAt.toISOString(),
      clinician: clinicianLabel(r.doctor),
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
      orderedBy: clinicianLabel(l.doctor),
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
      orderedBy: clinicianLabel(d.doctor),
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
        author: clinicianLabel(n.author),
        verifier: n.verifier ? clinicianLabel(n.verifier) : null,
      })),
    appointments: appointments.map((a) => {
      const parsed = parseAppointmentType(a.type);
      return {
        id: a.id,
        date: a.date,
        time: a.time,
        type: parsed.type,
        status: a.status,
        consultantName: parsed.consultantName || null,
        consultantSpecialty: parsed.consultantSpecialty || null,
        notes: parsed.notes || null,
        createdAt: a.createdAt.toISOString(),
      };
    }),
  };

  return NextResponse.json(
    { printable },
    { headers: { "Cache-Control": "no-store" } }
  );
}
