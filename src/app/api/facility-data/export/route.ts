import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import {
  buildFacilityExport,
  canPerformFacilityDataMigration,
} from "@/lib/data/facility-migration";

export const runtime = "nodejs";

/**
 * GET /api/facility-data/export
 * Facility-scoped patient demographics export for Owner/Admin only.
 * Scope is resolved exclusively from the authenticated membership.
 * Query/body clinicId is ignored.
 */
export async function GET(req: Request) {
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
      { success: false, error: "Only facility Owner or Admin may export hospital data." },
      { status: 403 }
    );
  }

  // Explicitly ignore any client-supplied facility selectors.
  const url = new URL(req.url);
  void url.searchParams.get("clinicId");
  void url.searchParams.get("facilityId");

  try {
    const pack = await buildFacilityExport(membership);

    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "FACILITY_DATA_EXPORT",
      entity: "FacilityData",
      entityId: membership.clinicId,
      meta: {
        patientCount: pack.patientCount,
        format: pack.format,
      },
    });

    return NextResponse.json({ success: true, export: pack });
  } catch (e) {
    console.error("facility-data export failed", e);
    return NextResponse.json(
      { success: false, error: "Unable to export facility data." },
      { status: 500 }
    );
  }
}
