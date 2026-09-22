import { prisma } from "@/lib/db";
import { allocateStaffCode } from "@/lib/staff-id";

/** Ensure the doctor has an active primary clinic membership (Owner). Assigns Staff ID if missing. */
export async function ensurePrimaryClinic(doctorId: string, clinicName: string) {
  const existing = await prisma.clinicMember.findFirst({
    where: { doctorId, isActive: true, clinic: { isActive: true } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    if (!existing.staffCode) {
      const code = await allocateStaffCode(existing.clinicId, existing.role || "Owner");
      await prisma.clinicMember.update({
        where: { id: existing.id },
        data: { staffCode: code, designation: existing.designation || existing.role || "Owner" },
      });
      return { ...existing, staffCode: code };
    }
    return existing;
  }

  const clinic = await prisma.clinic.create({
    data: { name: clinicName || "Clinic" },
  });
  const staffCode = await allocateStaffCode(clinic.id, "Owner");
  const membership = await prisma.clinicMember.create({
    data: {
      clinicId: clinic.id,
      doctorId,
      role: "Owner",
      staffCode,
      designation: "Owner",
      department: "Administration",
    },
  });
  return membership;
}
