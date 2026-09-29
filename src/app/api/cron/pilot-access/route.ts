import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureClinicProductTable } from "@/lib/clinic-products";
import { evaluatePilotAccess } from "@/lib/pilot-access";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  const vercelCron = req.headers.get("x-vercel-cron");
  if (secret) {
    if (auth !== `Bearer ${secret}` && !vercelCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production" && !vercelCron) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  await ensureClinicProductTable();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT s.*, c."name" AS "clinicName", c."isActive" AS "clinicIsActive"
     FROM "MedLumClinicSetup" s
     JOIN "Clinic" c ON c."id" = s."clinicId"
     WHERE s."pilotEndsAt" IS NOT NULL`
  );

  const now = new Date();
  let warned = 0;
  let locked = 0;
  let alreadyLocked = 0;

  for (const row of rows) {
    const state = evaluatePilotAccess(row, now);
    if (state.status === "warning" || state.status === "grace") {
      const last = row.pilotWarnedAt ? new Date(row.pilotWarnedAt).getTime() : 0;
      if (now.getTime() - last > 20 * 60 * 60 * 1000) {
        await prisma.$executeRawUnsafe(
          `UPDATE "MedLumClinicSetup" SET "pilotWarnedAt"=$2, "updatedAt"=CURRENT_TIMESTAMP WHERE "clinicId"=$1`,
          row.clinicId,
          now
        );
        try {
          await writeAudit({
            doctorId: undefined,
            clinicId: row.clinicId,
            action: state.status === "grace" ? "PILOT_GRACE_ACTIVE" : "PILOT_EXPIRY_WARNING",
            entity: "Clinic",
            entityId: row.clinicId,
            meta: {
              pilotEndsAt: state.pilotEndsAt?.toISOString(),
              graceEndsAt: state.graceEndsAt?.toISOString(),
              daysRemaining: state.daysRemaining,
              clinicName: row.clinicName,
            },
          });
        } catch { /* optional */ }
        warned += 1;
      }
    }

    if (state.status === "locked") {
      if (row.pilotLockedAt) {
        alreadyLocked += 1;
        continue;
      }
      await prisma.$executeRawUnsafe(
        `UPDATE "MedLumClinicSetup" SET "pilotLockedAt"=$2, "updatedAt"=CURRENT_TIMESTAMP WHERE "clinicId"=$1`,
        row.clinicId,
        now
      );
      await prisma.clinic.update({
        where: { id: row.clinicId },
        data: { isActive: false, deactivatedAt: now },
      });
      try {
        await writeAudit({
          doctorId: undefined,
          clinicId: row.clinicId,
          action: "PILOT_ACCESS_LOCKED",
          entity: "Clinic",
          entityId: row.clinicId,
          meta: {
            pilotEndsAt: state.pilotEndsAt?.toISOString(),
            graceEndsAt: state.graceEndsAt?.toISOString(),
            clinicName: row.clinicName,
            note: "Facility pilot access locked after grace. Clinical data retained.",
          },
        });
      } catch { /* optional */ }
      locked += 1;
    }
  }

  return NextResponse.json({
    success: true,
    scanned: rows.length,
    warned,
    locked,
    alreadyLocked,
    at: now.toISOString(),
  });
}

export async function GET(req: Request) {
  return POST(req);
}
