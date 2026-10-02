import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMedlumOwnerEmail } from "@/lib/owner";

const NON_BLOCKING = new Set(["ACTIVE", "GRACE_PERIOD"]);
const ALLOWED = new Set(["ACTIVE", "GRACE_PERIOD", "SUSPENDED", "LICENSE_EXPIRED", "COMPLIANCE_HOLD", "FRAUD_HOLD", "DEACTIVATED"]);

async function masterOwner() {
  const session = await getSession();
  if (!session) return null;
  const doctor = await prisma.doctor.findUnique({ where: { id: session.doctorId }, select: { id: true, email: true } });
  if (!doctor || !isMedlumOwnerEmail(doctor.email)) return null;
  return doctor;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await masterOwner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || "").trim().toUpperCase();
  const reason = String(body.reason || "").trim();
  const note = String(body.note || "").trim();

  if (!ALLOWED.has(status)) return NextResponse.json({ success: false, error: "Invalid facility status." }, { status: 400 });
  if (!reason) return NextResponse.json({ success: false, error: "A reason is required for facility lifecycle changes." }, { status: 400 });

  const existing = await prisma.clinic.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });

  const isActive = NON_BLOCKING.has(status);
  const clinic = await prisma.clinic.update({
    where: { id },
    data: {
      isActive,
      deactivatedAt: isActive ? null : (existing.deactivatedAt || new Date()),
      facilityStatus: status,
      statusReason: reason,
      statusNote: note,
      statusUpdatedAt: new Date(),
      statusUpdatedBy: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      doctorId: user.id,
      action: status === "ACTIVE" ? "FACILITY_REACTIVATED" : "FACILITY_STATUS_CHANGED",
      entity: "Clinic",
      entityId: id,
      meta: JSON.stringify({ clinicId: id, previousStatus: existing.facilityStatus, previousActive: existing.isActive, status, reason, note }),
    },
  });

  return NextResponse.json({ success: true, facility: clinic });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await masterOwner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const confirmName = String(body.confirmName || "").trim();
  const reason = String(body.reason || "").trim();

  if (!reason) return NextResponse.json({ success: false, error: "A deletion reason is required." }, { status: 400 });

  const clinic = await prisma.clinic.findUnique({ where: { id }, select: { id: true, name: true, isActive: true, facilityStatus: true } });
  if (!clinic) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });
  if (confirmName !== clinic.name) return NextResponse.json({ success: false, error: "Type the exact facility name to confirm permanent deletion." }, { status: 400 });

  const [members, patients, invoices, medicationAdministrations, bloodInventory, bloodDonors, bloodRequests, insuranceProviders, insurancePolicies, insuranceClaims, workforceRecords, clinicalNotes, telemedicineSessions, portalAccounts, telegramIntegration, otpChallenges, tariffVersions, labTemplates, abdmConsents, abdmCareContexts, abdmEvents, emergencyCases, medicalDocuments, dutyAttendanceEvents, dutyAttendanceRequests] = await Promise.all([
    prisma.clinicMember.count({ where: { clinicId: id } }),
    prisma.patient.count({ where: { clinicId: id } }),
    prisma.invoice.count({ where: { clinicId: id } }),
    prisma.medicationAdministration.count({ where: { clinicId: id } }),
    prisma.bloodInventory.count({ where: { clinicId: id } }),
    prisma.bloodDonor.count({ where: { clinicId: id } }),
    prisma.bloodRequest.count({ where: { clinicId: id } }),
    prisma.insuranceProvider.count({ where: { clinicId: id } }),
    prisma.insurancePolicy.count({ where: { clinicId: id } }),
    prisma.insuranceClaim.count({ where: { clinicId: id } }),
    prisma.workforceRecord.count({ where: { clinicId: id } }),
    prisma.clinicalNote.count({ where: { clinicId: id } }),
    prisma.telemedicineSession.count({ where: { clinicId: id } }),
    prisma.patientPortalAccount.count({ where: { clinicId: id } }),
    prisma.facilityTelegramIntegration.count({ where: { clinicId: id } }),
    prisma.otpChallenge.count({ where: { clinicId: id } }),
    prisma.tariffVersion.count({ where: { clinicId: id } }),
    prisma.labTemplate.count({ where: { clinicId: id } }),
    prisma.abdmConsent.count({ where: { clinicId: id } }),
    prisma.abdmCareContext.count({ where: { clinicId: id } }),
    prisma.abdmEvent.count({ where: { clinicId: id } }),
    prisma.emergencyCase.count({ where: { clinicId: id } }),
    prisma.medicalDocument.count({ where: { clinicId: id } }),
    prisma.dutyAttendanceEvent.count({ where: { clinicId: id } }),
    prisma.dutyAttendanceRequest.count({ where: { clinicId: id } }),
  ]);

  const dataCounts = { members, patients, invoices, medicationAdministrations, bloodInventory, bloodDonors, bloodRequests, insuranceProviders, insurancePolicies, insuranceClaims, workforceRecords, clinicalNotes, telemedicineSessions, portalAccounts, telegramIntegration, otpChallenges, tariffVersions, labTemplates, abdmConsents, abdmCareContexts, abdmEvents, emergencyCases, medicalDocuments, dutyAttendanceEvents, dutyAttendanceRequests };
  const meaningful = Object.entries(dataCounts).filter(([key, count]) => count > 0 && key !== "members" && key !== "telegramIntegration" && key !== "otpChallenges");
  if (meaningful.length) {
    return NextResponse.json({ success: false, error: "This facility contains clinical, billing, workforce, compliance, or other retained data and cannot be permanently deleted. Deactivate it instead.", dataCounts }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.clinicMember.deleteMany({ where: { clinicId: id } });
    await tx.facilityTelegramIntegration.deleteMany({ where: { clinicId: id } });
    await tx.otpChallenge.deleteMany({ where: { clinicId: id } });
    await tx.$executeRawUnsafe('DELETE FROM "MedLumClinicSetup" WHERE "clinicId" = $1', id).catch(() => undefined);
    await tx.clinic.delete({ where: { id } });
  });

  await prisma.auditLog.create({
    data: {
      doctorId: user.id,
      action: "FACILITY_DELETED",
      entity: "Clinic",
      entityId: id,
      meta: JSON.stringify({ clinicId: id, name: clinic.name, previousStatus: clinic.facilityStatus, reason }),
    },
  }).catch(() => undefined);

  return NextResponse.json({ success: true, deleted: true, facilityId: id });
}
