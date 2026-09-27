import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Central MedLum Staff Login ID generation.
 * Format: ROLE_PREFIX + 8 digits (e.g. CL01038020).
 * Not derived from PHI. Not sequential (avoids enumerating headcount).
 * Permanent for the ClinicMember lifetime — never reallocated on role change.
 */

const PREFIX_BY_ROLE: Record<string, string> = {
  owner: "ON",
  admin: "AD",
  manager: "MG",
  consultant: "CL",
  doctor: "CL",
  rmo: "RM",
  nurse: "RN",
  registered_nurse: "RN",
  laboratory: "LB",
  lab: "LB",
  pharmacy: "PH",
  pharmacist: "PH",
  diagnostic: "DG",
  diagnostics: "DG",
  billing: "BL",
  receptionist: "RC",
};

export function staffIdPrefix(role: string): string {
  const r = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return PREFIX_BY_ROLE[r] || "ST";
}

/** Normalize user input for lookup (case-insensitive, strip spaces/dashes). */
export function normalizeStaffLoginId(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
}

export function isStaffLoginIdFormat(value: string): boolean {
  const v = normalizeStaffLoginId(value);
  return /^[A-Z]{2,5}\d{4,10}$/.test(v) || /^[A-Z]{2,5}-\d{4,10}$/.test(String(value || "").trim().toUpperCase());
}

/**
 * Allocate a new Staff Login ID for a clinic membership.
 * Uniqueness is enforced globally on non-empty staffCode values.
 */
export async function allocateStaffCode(clinicId: string, role: string): Promise<string> {
  const prefix = staffIdPrefix(role);

  for (let attempt = 0; attempt < 32; attempt++) {
    const n = randomBytes(4).readUInt32BE(0) % 100_000_000;
    const code = `${prefix}${String(n).padStart(8, "0")}`;

    const clash = await prisma.clinicMember.findFirst({
      where: { staffCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }

  const fallback = `${prefix}${Date.now().toString().slice(-8)}`;
  return fallback;
}

/**
 * Resolve a Doctor by Staff Login ID (ClinicMember.staffCode).
 * Accepts legacy codes with dashes (DOC-0001) by trying normalized and raw forms.
 */
export async function findDoctorByStaffLoginId(raw: string): Promise<{
  doctor: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    clinicName: string;
    phone: string;
    isActive: boolean;
    createdAt: Date;
  };
  membership: { id: string; clinicId: string; role: string; staffCode: string } | null;
} | null> {
  const normalized = normalizeStaffLoginId(raw);
  if (!normalized) return null;

  const candidates = Array.from(
    new Set(
      [
        normalized,
        String(raw || "").trim(),
        String(raw || "").trim().toUpperCase(),
        normalized.replace(/^([A-Z]{2,5})(\d+)$/, "$1-$2"),
      ].filter(Boolean)
    )
  );

  const membership = await prisma.clinicMember.findFirst({
    where: {
      OR: candidates.map((c) => ({ staffCode: c })),
      isActive: true,
    },
    select: {
      id: true,
      clinicId: true,
      role: true,
      staffCode: true,
      doctorId: true,
      doctor: {
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
          clinicName: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!membership?.doctor) return null;
  return {
    doctor: membership.doctor,
    membership: {
      id: membership.id,
      clinicId: membership.clinicId,
      role: membership.role,
      staffCode: membership.staffCode,
    },
  };
}
