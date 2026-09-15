/** Production onboarding and auth policy helpers (server-only). */

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Public doctor signup is fail-closed in production unless explicitly enabled.
 * Set ALLOW_PUBLIC_SIGNUP=true only for controlled pilot onboarding windows.
 * Optional SIGNUP_INVITE_CODE: when set, request body/header must match.
 */
export function isPublicSignupAllowed(inviteFromRequest?: string | null): { allowed: boolean; reason?: string } {
  if (!isProductionRuntime()) {
    return { allowed: true };
  }

  if (process.env.ALLOW_PUBLIC_SIGNUP !== "true") {
    return {
      allowed: false,
      reason: "Doctor registration is disabled. Contact MedLum to onboard a clinic.",
    };
  }

  const required = String(process.env.SIGNUP_INVITE_CODE || "").trim();
  if (required) {
    const provided = String(inviteFromRequest || "").trim();
    if (!provided || provided !== required) {
      return {
        allowed: false,
        reason: "A valid invitation is required to register.",
      };
    }
  }

  return { allowed: true };
}
