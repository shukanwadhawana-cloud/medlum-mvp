/** Production onboarding and auth policy helpers (server-only). */

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Public self-serve hospital Owner signup is fail-closed in production unless
 * ALLOW_PUBLIC_SIGNUP=true (controlled pilot windows).
 * Existing Owners/Admins onboard staff via Clinic → Staff (no MedLum intervention).
 * Optional SIGNUP_INVITE_CODE: when set, request body/header must match.
 */
export function isPublicSignupAllowed(inviteFromRequest?: string | null): { allowed: boolean; reason?: string } {
  if (!isProductionRuntime()) {
    return { allowed: true };
  }

  if (process.env.ALLOW_PUBLIC_SIGNUP !== "true") {
    return {
      allowed: false,
      reason:
        "Public hospital registration is closed on this environment. If you already have a MedLum hospital, ask your Owner/Admin to add you under Clinic → Staff. To open a new hospital workspace, set ALLOW_PUBLIC_SIGNUP=true (or provide SIGNUP_INVITE_CODE) on the deployment.",
    };
  }

  const required = String(process.env.SIGNUP_INVITE_CODE || "").trim();
  if (required) {
    const provided = String(inviteFromRequest || "").trim();
    if (!provided || provided !== required) {
      return {
        allowed: false,
        reason: "A valid invitation code is required to register a new hospital workspace.",
      };
    }
  }

  return { allowed: true };
}
