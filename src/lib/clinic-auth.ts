/**
 * Server-side clinic membership and PHI authorization helpers.
 * Never trust client-supplied clinicId/doctorId for scope.
 */
import { prisma } from "@/lib/db";
export type ClinicRole =
  | "Owner"
  | "Admin"
  | "Manager"
  | "Consultant"
  | "Doctor"
  | "RMO"
  | "Nurse"
  | "Pharmacy"
  | "Laboratory"
  | "Billing"
  | "Receptionist"
  | "Staff";

export type ClinicMembershipContext = {
  membershipId: string;
  clinicId: string;
  doctorId: string;
  role: ClinicRole;
};

const CLINICAL_ROLES: ClinicRole[] = [
  "Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO",
  "Nurse", "Pharmacy", "Laboratory", "Billing", "Receptionist", "Staff",
];

const ROLE_ALIASES: Record<string, ClinicRole> = {
  Owner: "Owner", Admin: "Admin", Manager: "Manager", Consultant: "Consultant",
  Doctor: "Doctor", RMO: "RMO", Nurse: "Nurse", Pharmacy: "Pharmacy",
  Laboratory: "Laboratory", Billing: "Billing", Receptionist: "Receptionist", Staff: "Staff",
"Lab Tech": "Laboratory", Lab: "Laboratory", Pharmacist: "Pharmacy", Sister: "Nurse",
};

export function normalizeClinicRole(role: string): ClinicRole {
  if (!role) return "Consultant";
  return ROLE_ALIASES[role] || ROLE_ALIASES[role.trim()] || "Consultant";
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
    select: { id: true, clinicId: true, doctorId: true, role: true, doctor: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;
  // Enterprise Master Owner status is global and is intentionally NOT
  // inferred from a clinic membership. A person is a facility Owner only
  // when that clinic explicitly grants the Owner membership. This keeps
  // enterprise and facility scopes non-interchangeable.
  return {
    membershipId: membership.id,
    clinicId: membership.clinicId,
    doctorId: membership.doctorId,
    role: normalizeClinicRole(membership.role),
  };
}

export function isMembershipManager(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Manager";
}

export function canResetPortalPassword(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Manager";
}

export function canViewFullClinicalChart(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Manager" || role === "Consultant" || role === "Doctor" || role === "RMO";
}

export function canViewBillingDetail(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Manager" || role === "Billing";
}

export function canViewBillingSummary(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Manager" || role === "Consultant" || role === "Doctor" || role === "Billing" || role === "Receptionist";
}

export function canManageTariff(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Manager";
}

export function canManageLab(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Manager" || role === "Laboratory";
}

export function canManagePharmacy(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Manager" || role === "Pharmacy";
}

export function canAdministerMedication(role: ClinicRole): boolean {
  return role === "Owner" || role === "Admin" || role === "Manager" || role === "Consultant" || role === "Doctor" || role === "RMO" || role === "Nurse";
}

/**
 * Resolve a patient that belongs to the member's clinic (or legacy doctor-owned row).
 * Rejects cross-clinic IDs.
 */
export async function findAuthorizedPatient(
  ctx: ClinicMembershipContext,
  patientId: string,
  opts?: { includeDeleted?: boolean }
): Promise<{
  id: string;
  clinicId: string | null;
  doctorId: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  bp: string;
  allergies: string;
  notes: string;
  status?: string;
  deletedAt?: Date | null;
  registrationNo?: string;
  uhid?: string;
  abhaNumber?: string;
  abhaAddress?: string;
  abhaStatus?: string;
  abhaTxnId?: string;
  abhaLinkedAt?: Date | null;
  abhaVerifiedAt?: Date | null;
  createdAt: Date;
} | null> {
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      OR: [{ clinicId: ctx.clinicId }, { doctorId: ctx.doctorId, clinicId: null }],
      ...(opts?.includeDeleted ? {} : { deletedAt: null }),
    },
  });
  return patient;
}

export { CLINICAL_ROLES };
