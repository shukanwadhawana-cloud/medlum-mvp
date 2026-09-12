import { prisma } from "@/lib/db";

/**
 * Every doctor must own at least one active clinic membership so clinic-scoped
 * invoices, reports, and shared patients work. Idempotent for existing owners.
 */
export async function ensurePrimaryClinic(doctorId: string, clinicName: string) {
  const existing = await prisma.clinicMember.findFirst({
    where: { doctorId, isActive: true },
    select: { id: true, clinicId: true },
  });
  if (existing) return existing;

  const name = (clinicName || "Clinic").trim() || "Clinic";
  return prisma.$transaction(async (tx) => {
    const again = await tx.clinicMember.findFirst({
      where: { doctorId, isActive: true },
      select: { id: true, clinicId: true },
    });
    if (again) return again;

    const clinic = await tx.clinic.create({
      data: { name, isActive: true },
    });
    const member = await tx.clinicMember.create({
      data: {
        clinicId: clinic.id,
        doctorId,
        role: "Owner",
        isActive: true,
      },
      select: { id: true, clinicId: true },
    });

    // Attach orphan doctor-owned patients to this clinic when possible.
    await tx.patient.updateMany({
      where: { doctorId, clinicId: null },
      data: { clinicId: clinic.id },
    });

    return member;
  });
}
