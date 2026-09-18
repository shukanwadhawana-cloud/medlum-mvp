/** Production security helpers for MedLum. */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const MEDLUM_CLIENT_HEADER = "x-medlum-requested-with";
export const MEDLUM_CLIENT_HEADER_VALUE = "MedLum";

/**
 * Reject cross-site state-changing requests.
 * Origin present → must match. Origin absent → require MedLum client header.
 */
export function assertSameOrigin(req: Request): void {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (origin) {
    const expected = new URL(req.url).origin;
    if (origin !== expected) throw new Error("CSRF_ORIGIN_MISMATCH");
    return;
  }
  if (req.headers.get(MEDLUM_CLIENT_HEADER) !== MEDLUM_CLIENT_HEADER_VALUE) {
    throw new Error("CSRF_CLIENT_HEADER_MISSING");
  }
}

export function securityHeaders() {
  return [
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "SAMEORIGIN"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(self \"https://meet.jit.si\"), microphone=(self \"https://meet.jit.si\"), geolocation=(), payment=()"],
    ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
    ["Cross-Origin-Resource-Policy", "same-origin"],
  ] as const;
}
