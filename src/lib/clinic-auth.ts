/**
 * Server-side clinic membership and PHI authorization helpers.
 * Never trust client-supplied clinicId/doctorId for scope.
 */
import { prisma } from "@/lib/db";

export type ClinicRole = "Owner" | "Admin" | "Consultant" | "Staff";

export type ClinicMembershipContext = {
  membershipId: string;
  clinicId: string;
  doctorId: string;
  role: ClinicRole;
};

const CLINICAL_ROLES: ClinicRole[] = ["Owner", "Admin", "Consultant", "Staff"];

export function normalizeClinicRole(role: string): ClinicRole {
  if (role === "Owner" || role === "Admin" || role === "Consultant" || role === "Staff") return role;
  return "Consultant";
}

/** Active membership in an active clinic for this doctor (primary / oldest). */
export async function requireActiveClinicMembership(
  doctorId: string
): Promise<ClinicMembershipContext | null> {
  const membership = await prisma.clinicMember.findFirst({
    where: {
      doctorId,
      isActive: true,
      clinic: { isActive: true },
    },
    select: { id: true, clinicId: true, doctorId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;
  return {
    membershipId: membership.id,
    clinicId: membership.clinicId,
    doctorId: membership.doctorId,
    role: normalizeClinicRole(membership.role),
  };
}

export function isMembershipManager(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin";
}

export function canResetPortalPassword(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin";
}

export function canViewFullClinicalChart(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Consultant";
}

export function canViewBillingDetail(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin";
}

export function canViewBillingSummary(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Consultant";
}

/**
 * Resolve a patient that belongs to the member's clinic (or legacy doctor-owned row).
 * Rejects cross-clinic IDs.
 */
export async function findAuthorizedPatient(
  ctx: ClinicMembershipContext,
  patientId: string
): Promise<{ id: string; clinicId: string | null; doctorId: string; name: string; age: number; gender: string; phone: string; bp: string; allergies: string; notes: string; createdAt: Date } | null> {
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      OR: [{ clinicId: ctx.clinicId }, { doctorId: ctx.doctorId, clinicId: null }],
    },
  });
  return patient;
}

export { CLINICAL_ROLES };
