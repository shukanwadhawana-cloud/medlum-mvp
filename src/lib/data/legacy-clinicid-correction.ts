/**
 * Idempotent legacy Patient.clinicId correction.
 *
 * Safe rule only:
 * - patient.clinicId is null
 * - patient.doctorId is an active ClinicMember of exactly one clinic
 * - then set clinicId to that clinic
 *
 * Never:
 * - reassign when clinicId is already set
 * - guess when doctor belongs to 0 or 2+ facilities
 * - cross-facility overwrite
 */
import { prisma } from "@/lib/db";

export type LegacyClinicIdCorrectionResult = {
  scanned: number;
  corrected: number;
  skippedAmbiguous: number;
  skippedNoMembership: number;
  correctedIds: string[];
  unresolvedIds: string[];
};

export async function correctLegacyPatientClinicIds(opts?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<LegacyClinicIdCorrectionResult> {
  const dryRun = Boolean(opts?.dryRun);
  const limit = opts?.limit ?? 5000;

  const candidates = await prisma.patient.findMany({
    where: { clinicId: null, deletedAt: null },
    select: { id: true, doctorId: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  const result: LegacyClinicIdCorrectionResult = {
    scanned: candidates.length,
    corrected: 0,
    skippedAmbiguous: 0,
    skippedNoMembership: 0,
    correctedIds: [],
    unresolvedIds: [],
  };

  for (const p of candidates) {
    const memberships = await prisma.clinicMember.findMany({
      where: { doctorId: p.doctorId, isActive: true },
      select: { clinicId: true },
    });
    const uniqueClinicIds = Array.from(new Set(memberships.map((m) => m.clinicId)));

    if (uniqueClinicIds.length === 0) {
      result.skippedNoMembership += 1;
      result.unresolvedIds.push(p.id);
      continue;
    }
    if (uniqueClinicIds.length > 1) {
      result.skippedAmbiguous += 1;
      result.unresolvedIds.push(p.id);
      continue;
    }

    const clinicId = uniqueClinicIds[0];
    if (!dryRun) {
      const updated = await prisma.patient.updateMany({
        where: { id: p.id, clinicId: null },
        data: { clinicId },
      });
      if (updated.count === 0) continue;
      await prisma.auditLog.create({
        data: {
          doctorId: p.doctorId,
          action: "FACILITY_LEGACY_CLINICID_CORRECTION",
          entity: "Patient",
          entityId: p.id,
          meta: JSON.stringify({ clinicId, dryRun: false }),
        },
      });
    }
    result.corrected += 1;
    result.correctedIds.push(p.id);
  }

  return result;
}
