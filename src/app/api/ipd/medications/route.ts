import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireClinicalModule } from "@/lib/clinic-products";
import { canAdministerMedication, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { parseCareSetting } from "@/lib/patient-metadata";
import { writeAudit } from "@/lib/audit";

const ADMIN_STATUSES = new Set(["ADMINISTERED", "HELD", "OMITTED", "REFUSED", "CANCELLED"]);
const NON_ADMIN_STATUSES = new Set(["HELD", "OMITTED", "REFUSED", "CANCELLED"]);

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

async function authorizedPatient(clinicId: string, patientId: string) {
  return prisma.patient.findFirst({
    where: { id: patientId, clinicId, status: "ACTIVE" },
    select: { id: true, name: true, status: true, notes: true },
  });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireClinicalModule(session.doctorId, "IPD");
  if (!access.allowed || !access.clinicId) return NextResponse.json({ error: "IPD access is not included in this clinic's subscription." }, { status: 403 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || membership.clinicId !== access.clinicId || !canAdministerMedication(membership.role)) {
    return NextResponse.json({ error: "Medication administration authorization required" }, { status: 403 });
  }
  const patientId = new URL(req.url).searchParams.get("patientId")?.trim() || "";
  if (!patientId) return NextResponse.json({ error: "Patient is required" }, { status: 400 });
  const patient = await authorizedPatient(access.clinicId, patientId);
  if (!patient || parseCareSetting(patient.notes) !== "IPD") return NextResponse.json({ error: "Active IPD patient not found in this clinic" }, { status: 404 });

  const prescriptions = await prisma.prescription.findMany({
    where: { id: { in: (await prisma.prescription.findMany({ where: { patientId, patient: { clinicId: access.clinicId } }, select: { id: true } })).map((p) => p.id) } },
    include: { dispensings: { select: { status: true, dispensedAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  const administrations = await prisma.medicationAdministration.findMany({
    where: { clinicId: access.clinicId, patientId },
    include: {
      prescription: { select: { medicines: true } },
      administeringMember: { select: { role: true, staffCode: true, designation: true, doctor: { select: { name: true } } } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    patient: { id: patient.id, name: patient.name },
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      medicines: p.medicines,
      createdAt: p.createdAt.toISOString(),
      pharmacyStatus: p.dispensings[0]?.status || "Not sent to pharmacy",
      dispensedAt: iso(p.dispensings[0]?.dispensedAt),
    })),
    administrations: administrations.map((a) => ({
      id: a.id,
      prescriptionId: a.prescriptionId,
      medicationText: a.medicationText,
      medicationName: a.medicationName,
      dose: a.dose,
      doseUnit: a.doseUnit,
      route: a.route,
      frequency: a.frequency,
      scheduledAt: a.scheduledAt.toISOString(),
      actualAt: iso(a.actualAt),
      status: a.status,
      reason: a.reason,
      notes: a.notes,
      actor: a.administeringMember.doctor.name,
      role: a.administeringMember.designation || a.administeringMember.role,
      staffCode: a.administeringMember.staffCode,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireClinicalModule(session.doctorId, "IPD");
  if (!access.allowed || !access.clinicId) return NextResponse.json({ error: "IPD access is not included in this clinic's subscription." }, { status: 403 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || membership.clinicId !== access.clinicId || !canAdministerMedication(membership.role)) {
    return NextResponse.json({ error: "Medication administration authorization required" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const patientId = String(body.patientId || "").trim();
    const prescriptionId = String(body.prescriptionId || "").trim();
    const medicationText = String(body.medicationText || "").trim();
    const medicationName = String(body.medicationName || "").trim();
    const dose = String(body.dose || "").trim();
    const doseUnit = String(body.doseUnit || "").trim();
    const route = String(body.route || "").trim();
    const frequency = String(body.frequency || "OD").trim();
    const scheduledAt = new Date(String(body.scheduledAt || ""));
    const status = String(body.status || "SCHEDULED").trim();
    const reason = String(body.reason || "").trim();
    const notes = String(body.notes || "").trim();

    if (!patientId || !prescriptionId || !medicationText || !medicationName || !dose || !doseUnit || !route || !frequency || Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ success: false, error: "Patient, medication order, medication, dose, unit, route and scheduled time are required." }, { status: 400 });
    }
    if (status !== "SCHEDULED") return NextResponse.json({ success: false, error: "New medication-administration events must start in SCHEDULED state." }, { status: 400 });
    const patient = await authorizedPatient(access.clinicId, patientId);
    if (!patient || parseCareSetting(patient.notes) !== "IPD") return NextResponse.json({ success: false, error: "Active IPD patient not found in this clinic." }, { status: 404 });

    const prescription = await prisma.prescription.findFirst({
      where: { id: prescriptionId, patientId, patient: { clinicId: access.clinicId } },
      select: { id: true, patientId: true, medicines: true, encounterId: true },
    });
    if (!prescription) return NextResponse.json({ success: false, error: "Medication order not found for this IPD patient." }, { status: 404 });
    if (!prescription.medicines.includes(medicationText)) return NextResponse.json({ success: false, error: "Selected medication text is not present in the medication order." }, { status: 409 });

    try {
      const administration = await prisma.$transaction(async (tx) => {
        const member = await tx.clinicMember.findFirst({
          where: { id: membership.membershipId, clinicId: access.clinicId, doctorId: session.doctorId, isActive: true, clinic: { isActive: true }, doctor: { isActive: true } },
          select: { id: true },
        });
        if (!member) return { status: 403, body: { success: false, error: "Active administering clinician membership not found." } };
        const created = await tx.medicationAdministration.create({
          data: {
            clinicId: access.clinicId,
            patientId,
            prescriptionId,
            encounterId: prescription.encounterId,
            administeringMemberId: member.id,
            medicationText,
            medicationName,
            dose,
            doseUnit,
            route,
            frequency,
            scheduledAt,
            status: "SCHEDULED",
            reason: "",
            notes,
          },
        });
        return { status: 200, body: { success: true, administration: created } };
      }, { isolationLevel: "Serializable" });
      if (administration.status !== 200) return NextResponse.json(administration.body, { status: administration.status });
      const created = administration.body.administration;
      if (!created) return NextResponse.json({ success: false, error: "Medication administration was not created." }, { status: 500 });
      await writeAudit({ doctorId: session.doctorId, action: "schedule", entity: "MedicationAdministration", entityId: created.id, clinicId: access.clinicId, meta: { patientId, prescriptionId, medicationName, dose, doseUnit, route, frequency, scheduledAt: scheduledAt.toISOString(), status: "SCHEDULED" } });
      return NextResponse.json(administration.body);
    } catch (e: any) {
      if (e?.code === "P2002") return NextResponse.json({ success: false, error: "This medication dose is already scheduled for that prescription and time." }, { status: 409 });
      if (e?.code === "P2034") return NextResponse.json({ success: false, error: "A concurrent medication scheduling request was detected. Please refresh." }, { status: 409 });
      throw e;
    }
  } catch (e) {
    console.error("medication administration post", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireClinicalModule(session.doctorId, "IPD");
  if (!access.allowed || !access.clinicId) return NextResponse.json({ error: "IPD access is not included in this clinic's subscription." }, { status: 403 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || membership.clinicId !== access.clinicId || !canAdministerMedication(membership.role)) {
    return NextResponse.json({ error: "Medication administration authorization required" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim();
    const reason = String(body.reason || "").trim();
    const notes = String(body.notes || "").trim();
    if (!id || !ADMIN_STATUSES.has(status)) return NextResponse.json({ success: false, error: "Valid medication-administration status is required." }, { status: 400 });
    if (NON_ADMIN_STATUSES.has(status) && !reason) return NextResponse.json({ success: false, error: "A reason is required for non-administration outcomes." }, { status: 400 });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.medicationAdministration.findFirst({
          where: { id, clinicId: access.clinicId, patient: { clinicId: access.clinicId } },
        });
        if (!existing) return { status: 404, body: { success: false, error: "Medication-administration event not found in this clinic." } };
        if (existing.status !== "SCHEDULED") return { status: 409, body: { success: false, error: "Only a scheduled medication dose can be updated." } };
        const patient = await tx.patient.findFirst({ where: { id: existing.patientId, clinicId: access.clinicId, status: "ACTIVE" }, select: { id: true, notes: true } });
        if (!patient || parseCareSetting(patient.notes) !== "IPD") return { status: 409, body: { success: false, error: "Medication administration is only valid for an active IPD patient." } };
        const prescription = await tx.prescription.findFirst({ where: { id: existing.prescriptionId, patientId: existing.patientId, patient: { clinicId: access.clinicId } }, select: { id: true, medicines: true } });
        if (!prescription || !prescription.medicines.includes(existing.medicationText)) return { status: 409, body: { success: false, error: "The linked medication order is no longer valid for this event." } };
        const member = await tx.clinicMember.findFirst({ where: { id: membership.membershipId, clinicId: access.clinicId, doctorId: session.doctorId, isActive: true, doctor: { isActive: true } }, select: { id: true } });
        if (!member) return { status: 403, body: { success: false, error: "Active administering clinician membership not found." } };
        const now = new Date();
        const updated = await tx.medicationAdministration.update({
          where: { id },
          data: {
            status,
            actualAt: status === "ADMINISTERED" ? now : null,
            reason,
            notes: notes || existing.notes,
            administeringMemberId: member.id,
          },
        });
        return { status: 200, body: { success: true, administration: updated } };
      }, { isolationLevel: "Serializable" });
      if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });
      const updated = result.body.administration;
      if (!updated) return NextResponse.json({ success: false, error: "Medication administration was not updated." }, { status: 500 });
      await writeAudit({ doctorId: session.doctorId, action: status === "ADMINISTERED" ? "administer" : "update", entity: "MedicationAdministration", entityId: id, clinicId: access.clinicId, meta: { patientId: updated.patientId, prescriptionId: updated.prescriptionId, medicationName: updated.medicationName, dose: updated.dose, doseUnit: updated.doseUnit, route: updated.route, frequency: updated.frequency, scheduledAt: updated.scheduledAt.toISOString(), actualAt: updated.actualAt?.toISOString() || null, status, reason, notes: updated.notes } });
      return NextResponse.json(result.body);
    } catch (e: any) {
      if (e?.code === "P2034") return NextResponse.json({ success: false, error: "A concurrent medication administration was detected. Please refresh before recording the dose." }, { status: 409 });
      throw e;
    }
  } catch (e) {
    console.error("medication administration patch", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
