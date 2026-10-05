import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import {
  canPerformFacilityDataMigration,
  previewFacilityImport,
} from "@/lib/data/facility-migration";

export const runtime = "nodejs";

/**
 * POST /api/facility-data/import/preview
 * Non-mutating validation of an import package against the active facility.
 * Destination facility is always membership.clinicId — never client body.
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
      { success: false, error: "Only facility Owner or Admin may preview hospital data import." },
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
    const preview = await previewFacilityImport(membership, payload);

    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "FACILITY_DATA_IMPORT_PREVIEW",
      entity: "FacilityData",
      entityId: membership.clinicId,
      meta: {
        total: preview.summary.total,
        wouldCreate: preview.summary.wouldCreate,
        duplicateMatches: preview.summary.duplicateMatches,
        conflicts: preview.summary.conflicts,
        invalid: preview.summary.invalid,
        mutated: false,
      },
    });

    return NextResponse.json({ success: true, preview });
  } catch (e) {
    console.error("facility-data import preview failed", e);
    return NextResponse.json(
      { success: false, error: "Unable to preview import." },
      { status: 500 }
    );
  }
}
