import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Signature-authenticated or intentionally public mutations — not cookie CSRF targets. */
const CSRF_EXEMPT_PREFIXES = [
  "/api/payments/razorpay/webhook",
  "/api/interoperability/eka/webhooks",
  "/api/interoperability/eka/hiu/data-on-push",
  "/api/telegram/webhook",
  "/api/public/",
];

export const MEDLUM_CLIENT_HEADER = "x-medlum-requested-with";
export const MEDLUM_CLIENT_HEADER_VALUE = "MedLum";

function getExpectedOrigin(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = forwardedHost || req.headers.get("host") || "";
  if (!host) return null;
  return `${forwardedProto}://${host}`;
}

function isExemptPath(pathname: string) {
  return CSRF_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (SAFE_METHODS.has(req.method) || isExemptPath(pathname)) {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin");
  const expected = getExpectedOrigin(req);
  if (origin && expected && origin !== expected) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  if (!origin) {
    const medlum = req.headers.get(MEDLUM_CLIENT_HEADER);
    if (medlum !== MEDLUM_CLIENT_HEADER_VALUE) {
      return NextResponse.json({ error: "Missing client integrity header" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
