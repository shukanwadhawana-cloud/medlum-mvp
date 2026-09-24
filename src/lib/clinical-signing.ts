import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { normalizeClinicRole, type ClinicRole } from "@/lib/clinic-auth";

export const CLINICAL_VERIFIER_ROLES: ClinicRole[] = [
  "Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO",
];

export function canFinalizeClinicalNote(role: ClinicRole) {
  return CLINICAL_VERIFIER_ROLES.includes(role);
}

export function hashClinicalNote(content: string, version: number) {
  return createHash("sha256").update(`v${version}:\n${content}`).digest("hex");
}

export async function getClinicalActor(doctorId: string, clinicId: string) {
  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId, clinicId, isActive: true, clinic: { isActive: true }, doctor: { isActive: true } },
    select: {
      id: true, doctorId: true, role: true, staffCode: true, designation: true,
      doctor: { select: { id: true, name: true, email: true } },
    },
  });
  if (!membership) return null;
  return { ...membership, normalizedRole: normalizeClinicRole(membership.role) };
}

export function signingError(message: string, status = 400) {
  return { success: false, error: message, status };
}
