import { prisma } from "@/lib/db";

export async function getClinicMembership(doctorId: string) {
  return prisma.clinicMember.findFirst({
    where: { doctorId, isActive: true },
    select: { clinicId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getClinicWithHip(clinicId: string) {
  return prisma.clinic.findFirst({
    where: { id: clinicId, isActive: true },
    select: { id: true, name: true, ekaHipId: true, ekaHipCode: true, ekaOnboardedAt: true },
  });
}

/** Prefer clinic-scoped HIP; fall back to deployment EKA_HIP_ID only when clinic has none. */
export function resolveHipId(clinicHipId: string | null | undefined): string {
  const fromClinic = String(clinicHipId || "").trim();
  if (fromClinic) return fromClinic;
  return String(process.env.EKA_HIP_ID || "").trim();
}

export async function getTenantPatient(patientId: string, doctorId: string) {
  const membership = await getClinicMembership(doctorId);
  if (!membership?.clinicId) {
    return prisma.patient.findFirst({
      where: { id: patientId, doctorId, deletedAt: null },
    });
  }
  return prisma.patient.findFirst({
    where: { id: patientId, clinicId: membership.clinicId, deletedAt: null },
  });
}
