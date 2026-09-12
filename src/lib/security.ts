/** Production security helpers for MedLum. */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Reject cross-site state-changing requests when a browser supplies an Origin.
 * Native Capacitor clients may omit Origin, so absence is allowed.
 */
export function assertSameOrigin(req: Request): void {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return;

  const expected = new URL(req.url).origin;
  if (origin !== expected) {
    throw new Error("CSRF_ORIGIN_MISMATCH");
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
