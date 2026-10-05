/**
 * Server-side RBAC + facility authorization for MedLum API routes.
 *
 * Rules:
 * - Facility scope ALWAYS comes from requireActiveClinicMembership (DB), never from client clinicId.
 * - Role permission checks use the existing permissions matrix (permissions.ts).
 * - Patient access uses findAuthorizedPatient (facility-scoped + safe legacy null clinicId rule).
 * - Platform Owner is separate from facility Owner (isMedlumOwnerEmail / MEDLUM_OWNER_EMAIL).
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  requireActiveClinicMembership,
  findAuthorizedPatient,
  type ClinicMembershipContext,
  type ClinicRole,
} from "@/lib/clinic-auth";
import {
  canPrescribe,
  canDispense,
  canEnterLabResult,
  canEnterDiagnosticReport,
  canManageMAR,
  canViewClinicalChart,
  canOrderLabs,
  canViewBilling,
  canManageStaff,
  canManageClinic,
  canAccessClinicalAssist,
} from "@/lib/permissions";

export type AuthzContext = {
  session: { doctorId: string; email?: string };
  membership: ClinicMembershipContext;
};

export type PermissionKey =
  | "prescribe"
  | "dispense"
  | "enter_lab_result"
  | "enter_diagnostic_report"
  | "manage_mar"
  | "view_clinical_chart"
  | "order_labs"
  | "view_billing"
  | "manage_staff"
  | "manage_clinic"
  | "clinical_assist";

const PERMISSION_CHECKERS: Record<PermissionKey, (role: string) => boolean> = {
  prescribe: canPrescribe,
  dispense: canDispense,
  enter_lab_result: canEnterLabResult,
  enter_diagnostic_report: canEnterDiagnosticReport,
  manage_mar: canManageMAR,
  view_clinical_chart: canViewClinicalChart,
  order_labs: canOrderLabs,
  view_billing: canViewBilling,
  manage_staff: canManageStaff,
  manage_clinic: canManageClinic,
  clinical_assist: canAccessClinicalAssist,
};

/**
 * Authenticate + resolve active facility membership.
 * Ignores any client-supplied clinicId/facilityId in the request.
 */
export async function requireAuthz(): Promise<
  { ok: true; ctx: AuthzContext } | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "No active clinic membership." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, ctx: { session, membership } };
}

/**
 * Require a specific permission against the authenticated membership role.
 * Client-supplied role strings are never consulted.
 */
export function requirePermission(
  ctx: AuthzContext,
  permission: PermissionKey
): { ok: true } | { ok: false; response: NextResponse } {
  const checker = PERMISSION_CHECKERS[permission];
  if (!checker(ctx.membership.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Insufficient role permissions for this operation.", code: "RBAC_DENIED" },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}

/**
 * Resolve a patient inside the authenticated facility.
 * Rejects cross-facility IDs (including attempts via legacy null clinicId rows owned by other facilities).
 */
export async function requireAuthorizedPatient(ctx: AuthzContext, patientId: string) {
  if (!patientId) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "Patient id required." }, { status: 400 }),
    };
  }
  const patient = await findAuthorizedPatient(ctx.membership, patientId);
  if (!patient) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "Patient not found." }, { status: 404 }),
    };
  }
  return { ok: true as const, patient };
}

/**
 * Explicitly ignore client facility selectors so callers document the boundary.
 */
export function discardClientFacilitySelectors(body: Record<string, unknown> | null | undefined): void {
  if (!body || typeof body !== "object") return;
  void body.clinicId;
  void body.facilityId;
  void body.destinationClinicId;
  void body.role;
  void body.permissions;
}

export type { ClinicRole, ClinicMembershipContext };
