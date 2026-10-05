/**
 * Facility-scoped hospital data export / import helpers.
 *
 * Security boundary (server-only):
 * - Destination facility is ALWAYS the authenticated membership.clinicId.
 * - Client-supplied clinicId / facilityId / doctorId / ownerId are ignored.
 * - Only Owner and Admin may export or import.
 * - Preview never mutates production data.
 * - Import never overwrites existing clinical records; duplicates become conflicts.
 * - Passwords, session tokens, API keys, and secrets are never included.
 */

import { prisma } from "@/lib/db";
import type { ClinicMembershipContext, ClinicRole } from "@/lib/clinic-auth";

export const FACILITY_MIGRATION_ROLES: readonly ClinicRole[] = ["Owner", "Admin"] as const;

export function canPerformFacilityDataMigration(role: ClinicRole): boolean {
  return FACILITY_MIGRATION_ROLES.includes(role);
}

export type FacilityExportPatient = {
  externalId: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  bp?: string;
  allergies?: string;
  notes?: string;
  status?: string;
  registrationNo?: string;
  uhid?: string;
  abhaNumber?: string;
  abhaAddress?: string;
  abhaStatus?: string;
  createdAt?: string;
};

export type FacilityExportPackage = {
  format: "medlum-facility-export-v1";
  exportedAt: string;
  sourceClinicId: string;
  sourceClinicName?: string;
  patientCount: number;
  patients: FacilityExportPatient[];
};

export type ImportRecordDecision =
  | "create"
  | "duplicate_match"
  | "conflict"
  | "invalid";

export type ImportPreviewRow = {
  index: number;
  decision: ImportRecordDecision;
  reason: string;
  incoming: Partial<FacilityExportPatient>;
  matchedPatientId?: string;
};

export type ImportPreviewResult = {
  valid: boolean;
  summary: {
    total: number;
    wouldCreate: number;
    duplicateMatches: number;
    conflicts: number;
    invalid: number;
  };
  rows: ImportPreviewRow[];
};

export type ImportCommitResult = {
  success: boolean;
  created: number;
  skippedDuplicates: number;
  rejected: number;
  conflicts: number;
  errors: string[];
  createdPatientIds: string[];
};

const MAX_IMPORT_BATCH = 500;

function normalizePhone(phone: string | undefined): string {
  return String(phone || "").replace(/\D/g, "");
}

function normalizeUhid(value: string | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function isValidPatientPayload(p: Partial<FacilityExportPatient>): string | null {
  if (!p || typeof p !== "object") return "Record is not an object";
  const name = String(p.name || "").trim();
  if (!name || name.length > 200) return "Missing or invalid name";
  const age = Number(p.age);
  if (!Number.isFinite(age) || age < 0 || age > 150) return "Missing or invalid age";
  const gender = String(p.gender || "").trim();
  if (!gender || gender.length > 40) return "Missing or invalid gender";
  const phone = String(p.phone || "").trim();
  if (phone.length > 40) return "Invalid phone";
  return null;
}

export async function buildFacilityExport(
  membership: ClinicMembershipContext
): Promise<FacilityExportPackage> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: { id: true, name: true },
  });

  const patients = await prisma.patient.findMany({
    where: {
      clinicId: membership.clinicId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      age: true,
      gender: true,
      phone: true,
      bp: true,
      allergies: true,
      notes: true,
      status: true,
      registrationNo: true,
      uhid: true,
      abhaNumber: true,
      abhaAddress: true,
      abhaStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: 10000,
  });

  const exported: FacilityExportPatient[] = patients.map((p) => ({
    externalId: p.id,
    name: p.name,
    age: p.age,
    gender: p.gender,
    phone: p.phone,
    bp: p.bp || undefined,
    allergies: p.allergies || undefined,
    notes: p.notes && p.notes.length <= 2000 ? p.notes : undefined,
    status: p.status || undefined,
    registrationNo: p.registrationNo || undefined,
    uhid: p.uhid || undefined,
    abhaNumber: p.abhaNumber || undefined,
    abhaAddress: p.abhaAddress || undefined,
    abhaStatus: p.abhaStatus || undefined,
    createdAt: p.createdAt.toISOString(),
  }));

  return {
    format: "medlum-facility-export-v1",
    exportedAt: new Date().toISOString(),
    sourceClinicId: membership.clinicId,
    sourceClinicName: clinic?.name,
    patientCount: exported.length,
    patients: exported,
  };
}

export async function previewFacilityImport(
  membership: ClinicMembershipContext,
  payload: unknown
): Promise<ImportPreviewResult> {
  const rows: ImportPreviewRow[] = [];
  let wouldCreate = 0;
  let duplicateMatches = 0;
  let conflicts = 0;
  let invalid = 0;

  if (!payload || typeof payload !== "object") {
    return {
      valid: false,
      summary: { total: 0, wouldCreate: 0, duplicateMatches: 0, conflicts: 0, invalid: 1 },
      rows: [{ index: 0, decision: "invalid", reason: "Payload must be a JSON object", incoming: {} }],
    };
  }

  const body = payload as Record<string, unknown>;
  void body.clinicId;
  void body.facilityId;
  void body.destinationClinicId;
  void body.doctorId;
  void body.ownerId;

  const patientsRaw = Array.isArray(body.patients)
    ? body.patients
    : Array.isArray(body)
      ? body
      : null;

  if (!patientsRaw) {
    return {
      valid: false,
      summary: { total: 0, wouldCreate: 0, duplicateMatches: 0, conflicts: 0, invalid: 1 },
      rows: [{ index: 0, decision: "invalid", reason: "Expected patients array", incoming: {} }],
    };
  }

  if (patientsRaw.length > MAX_IMPORT_BATCH) {
    return {
      valid: false,
      summary: { total: patientsRaw.length, wouldCreate: 0, duplicateMatches: 0, conflicts: 0, invalid: patientsRaw.length },
      rows: [{
        index: 0,
        decision: "invalid",
        reason: `Batch exceeds maximum of ${MAX_IMPORT_BATCH} patients`,
        incoming: {},
      }],
    };
  }

  const existing = await prisma.patient.findMany({
    where: { clinicId: membership.clinicId, deletedAt: null },
    select: { id: true, name: true, age: true, phone: true, uhid: true, registrationNo: true },
  });

  const byUhid = new Map<string, string>();
  const byReg = new Map<string, string>();
  const byPhoneName = new Map<string, string>();
  for (const e of existing) {
    const u = normalizeUhid(e.uhid);
    if (u) byUhid.set(u, e.id);
    const r = normalizeUhid(e.registrationNo);
    if (r) byReg.set(r, e.id);
    const phone = normalizePhone(e.phone);
    if (phone) byPhoneName.set(`${phone}|${e.name.trim().toLowerCase()}|${e.age}`, e.id);
  }

  for (let i = 0; i < patientsRaw.length; i++) {
    const incoming = patientsRaw[i] as Partial<FacilityExportPatient>;
    const err = isValidPatientPayload(incoming);
    if (err) {
      invalid++;
      rows.push({ index: i, decision: "invalid", reason: err, incoming });
      continue;
    }

    const uhid = normalizeUhid(incoming.uhid);
    const reg = normalizeUhid(incoming.registrationNo);
    const phone = normalizePhone(incoming.phone);
    const nameKey = String(incoming.name || "").trim().toLowerCase();
    const age = Number(incoming.age);

    let matchedId: string | undefined;
    if (uhid && byUhid.has(uhid)) matchedId = byUhid.get(uhid);
    else if (reg && byReg.has(reg)) matchedId = byReg.get(reg);
    else if (phone && byPhoneName.has(`${phone}|${nameKey}|${age}`)) {
      matchedId = byPhoneName.get(`${phone}|${nameKey}|${age}`);
    }

    if (matchedId) {
      duplicateMatches++;
      rows.push({
        index: i,
        decision: "duplicate_match",
        reason: "Matching patient already exists in this facility; will not overwrite",
        incoming,
        matchedPatientId: matchedId,
      });
      continue;
    }

    wouldCreate++;
    rows.push({
      index: i,
      decision: "create",
      reason: "No facility match; will create new patient record",
      incoming,
    });
  }

  return {
    valid: invalid === 0 && conflicts === 0,
    summary: {
      total: patientsRaw.length,
      wouldCreate,
      duplicateMatches,
      conflicts,
      invalid,
    },
    rows,
  };
}

export async function commitFacilityImport(
  membership: ClinicMembershipContext,
  payload: unknown
): Promise<ImportCommitResult> {
  const preview = await previewFacilityImport(membership, payload);
  const errors: string[] = [];
  const createdPatientIds: string[] = [];
  let created = 0;
  let skippedDuplicates = 0;
  let rejected = 0;
  let conflicts = 0;

  if (preview.summary.invalid > 0) {
    return {
      success: false,
      created: 0,
      skippedDuplicates: 0,
      rejected: preview.summary.invalid,
      conflicts: preview.summary.conflicts,
      errors: ["Import rejected: fix invalid records before commit. Use preview endpoint first."],
      createdPatientIds: [],
    };
  }

  const toCreate = preview.rows.filter((r) => r.decision === "create");
  skippedDuplicates = preview.summary.duplicateMatches;
  conflicts = preview.summary.conflicts;
  rejected = preview.summary.invalid;

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of toCreate) {
        const p = row.incoming;
        const name = String(p.name || "").trim();
        const age = Number(p.age) || 0;
        const gender = String(p.gender || "").trim() || "Other";
        const phone = String(p.phone || "").trim();

        const createdPatient = await tx.patient.create({
          data: {
            doctorId: membership.doctorId,
            clinicId: membership.clinicId,
            name,
            age,
            gender,
            phone,
            bp: String(p.bp || ""),
            allergies: String(p.allergies || ""),
            notes: String(p.notes || "").slice(0, 2000),
            status: "ACTIVE",
            registrationNo: normalizeUhid(p.registrationNo) || "",
            uhid: normalizeUhid(p.uhid) || "",
            abhaNumber: String(p.abhaNumber || "").slice(0, 64),
            abhaAddress: String(p.abhaAddress || "").slice(0, 128),
            abhaStatus: String(p.abhaStatus || "NOT_LINKED").slice(0, 32),
          },
          select: { id: true },
        });
        createdPatientIds.push(createdPatient.id);
        created++;
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transaction failed";
    console.error("facility import commit failed", msg);
    return {
      success: false,
      created: 0,
      skippedDuplicates,
      rejected: toCreate.length,
      conflicts,
      errors: ["Import failed and was rolled back. No partial records were kept."],
      createdPatientIds: [],
    };
  }

  return {
    success: true,
    created,
    skippedDuplicates,
    rejected,
    conflicts,
    errors,
    createdPatientIds,
  };
}
