import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import {
  canPerformFacilityDataMigration,
  commitFacilityImport,
} from "@/lib/data/facility-migration";

export const runtime = "nodejs";

/**
 * POST /api/facility-data/import/commit
 * Persist import into the authenticated facility only.
 * Uses a transaction; rolls back on failure. Never trusts client facilityId.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) {
    return NextResponse.json({ success: false, error: "No active clinic membership." }, { status: 403 });
  }

  if (!canPerformFacilityDataMigration(membership.role)) {
    return NextResponse.json(
      { success: false, error: "Only facility Owner or Admin may import hospital data." },
      { status: 403 }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await commitFacilityImport(membership, payload);

    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "FACILITY_DATA_IMPORT_COMMIT",
      entity: "FacilityData",
      entityId: membership.clinicId,
      meta: {
        success: result.success,
        created: result.created,
        skippedDuplicates: result.skippedDuplicates,
        rejected: result.rejected,
        conflicts: result.conflicts,
        // Do not log full patient lists or PHI.
        createdCount: result.createdPatientIds.length,
      },
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.errors[0] || "Import failed.",
          result,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, result });
  } catch (e) {
    console.error("facility-data import commit failed", e);
    return NextResponse.json(
      { success: false, error: "Unable to complete import." },
      { status: 500 }
    );
  }
}
