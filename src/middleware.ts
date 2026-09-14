import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getExpectedOrigin(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin;
}

export function middleware(req: NextRequest) {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (process.env.NODE_ENV === "production" && forwardedProto === "http") {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  if (req.nextUrl.pathname.startsWith("/api/") && !SAFE_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    const expectedOrigin = getExpectedOrigin(req);
    if (origin && origin !== req.nextUrl.origin && origin !== expectedOrigin) {
      return NextResponse.json({ success: false, error: "Cross-origin request rejected" }, { status: 403 });
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", 'camera=(self "https://meet.jit.si"), microphone=(self "https://meet.jit.si"), geolocation=(), payment=()');
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
