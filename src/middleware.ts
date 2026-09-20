import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Signature-authenticated or intentionally public mutations — not cookie CSRF targets. */
const CSRF_EXEMPT_PREFIXES = [
  "/api/payments/razorpay/webhook",
  "/api/interoperability/eka/webhooks",
  "/api/telegram/webhook",
  "/api/public/",
];

export const MEDLUM_CLIENT_HEADER = "x-medlum-requested-with";
export const MEDLUM_CLIENT_HEADER_VALUE = "MedLum";

function getExpectedOrigin(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin;
}

function isCsrfExempt(pathname: string) {
  return CSRF_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * CSRF for cookie-authenticated mutations:
 * - Origin present → must match app origin (Render-aware).
 * - Origin absent → require X-MedLum-Requested-With: MedLum.
 * Webhooks + public booking exempt (Telegram uses x-telegram-bot-api-secret-token).
 */
function assertCsrf(req: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) return null;
  if (!req.nextUrl.pathname.startsWith("/api/")) return null;
  if (isCsrfExempt(req.nextUrl.pathname)) return null;

  const origin = req.headers.get("origin");
  const expectedOrigin = getExpectedOrigin(req);

  if (origin) {
    if (origin !== req.nextUrl.origin && origin !== expectedOrigin) {
      return NextResponse.json(
        { success: false, error: "Cross-origin request rejected" },
        { status: 403 }
      );
    }
    return null;
  }

  const clientHeader = req.headers.get(MEDLUM_CLIENT_HEADER);
  if (clientHeader !== MEDLUM_CLIENT_HEADER_VALUE) {
    return NextResponse.json(
      { success: false, error: "CSRF validation failed" },
      { status: 403 }
    );
  }
  return null;
}

function buildCsp(): string {
  // From actual app needs: Next.js self, Razorpay checkout, Jitsi, EKA.
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://api.razorpay.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://api.eka.care https://meet.jit.si wss://meet.jit.si",
    "frame-src 'self' https://meet.jit.si https://*.jit.si https://api.razorpay.com https://checkout.razorpay.com",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const csrfBlock = assertCsrf(req);
  if (csrfBlock) return csrfBlock;

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    'camera=(self "https://meet.jit.si"), microphone=(self "https://meet.jit.si"), geolocation=(), payment=()'
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    response.headers.set("Content-Security-Policy", buildCsp());
  }

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
