/**
 * Facility pilot access evaluation (pure + setup lookup).
 * Kept separate from clinic-auth to avoid circular imports.
 */
import { prisma } from "@/lib/db";

export type PilotAccessState =
  | { status: "open"; pilotEndsAt: null; graceEndsAt: null; daysRemaining: null }
  | { status: "active" | "warning" | "grace" | "locked"; pilotEndsAt: Date; graceEndsAt: Date; daysRemaining: number };

const DEFAULT_GRACE_DAYS = 5;
const WARNING_DAYS = 7;

export function evaluatePilotAccess(setup: {
  pilotEndsAt?: Date | string | null;
  pilotGraceDays?: number | null;
  pilotLockedAt?: Date | string | null;
}, now = new Date()): PilotAccessState {
  const endsRaw = setup.pilotEndsAt ? new Date(setup.pilotEndsAt) : null;
  if (!endsRaw || Number.isNaN(endsRaw.getTime())) {
    return { status: "open", pilotEndsAt: null, graceEndsAt: null, daysRemaining: null };
  }
  const graceDays = Math.max(0, Number(setup.pilotGraceDays ?? DEFAULT_GRACE_DAYS) || DEFAULT_GRACE_DAYS);
  const graceEndsAt = new Date(endsRaw.getTime() + graceDays * 24 * 60 * 60 * 1000);
  const msLeft = endsRaw.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (now.getTime() > graceEndsAt.getTime() || setup.pilotLockedAt) {
    return { status: "locked", pilotEndsAt: endsRaw, graceEndsAt, daysRemaining: Math.min(0, daysRemaining) };
  }
  if (now.getTime() > endsRaw.getTime()) {
    return { status: "grace", pilotEndsAt: endsRaw, graceEndsAt, daysRemaining: 0 };
  }
  if (daysRemaining <= WARNING_DAYS) {
    return { status: "warning", pilotEndsAt: endsRaw, graceEndsAt, daysRemaining };
  }
  return { status: "active", pilotEndsAt: endsRaw, graceEndsAt, daysRemaining };
}

export async function getPilotAccessState(clinicId: string, now = new Date()): Promise<PilotAccessState> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "MedLumClinicSetup"
        ADD COLUMN IF NOT EXISTS "pilotEndsAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "pilotGraceDays" INTEGER NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS "pilotWarnedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "pilotLockedAt" TIMESTAMP(3)
    `);
  } catch { /* table may not exist yet */ }

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "pilotEndsAt", "pilotGraceDays", "pilotLockedAt" FROM "MedLumClinicSetup" WHERE "clinicId" = $1 LIMIT 1`,
      clinicId
    );
    if (!rows[0]) return evaluatePilotAccess({}, now);
    return evaluatePilotAccess(rows[0], now);
  } catch {
    return evaluatePilotAccess({}, now);
  }
}
