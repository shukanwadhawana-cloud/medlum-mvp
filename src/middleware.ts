import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF: require same-origin for state-changing API requests.
 * Browser requests without Origin/Referer are still allowed for non-browser clients
 * that present valid session cookies only when they are not cross-site navigations.
 */
function assertCsrf(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  if (!req.nextUrl.pathname.startsWith("/api/")) return null;

  // Public webhook / cron paths that authenticate via shared secrets instead of cookies.
  const path = req.nextUrl.pathname;
  if (
    path.startsWith("/api/telegram/webhook") ||
    path.startsWith("/api/interoperability/eka/webhooks") ||
    path.startsWith("/api/cron")
  ) {
    return null;
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host") || req.nextUrl.host;
  const allowed = new Set<
    string
  >([
    `https://${host}`,
    `http://${host}`,
    process.env.NEXT_PUBLIC_APP_URL || "",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ].filter(Boolean));

  if (origin) {
    if (![...allowed].some((a) => origin === a || origin.startsWith(a + "/"))) {
      // Also allow exact Vercel preview hosts when present in Origin.
      try {
        const o = new URL(origin);
        if (o.host !== host && !o.host.endsWith(".vercel.app")) {
          return NextResponse.json({ success: false, error: "CSRF validation failed" }, { status: 403 });
        }
        if (o.host !== host && o.host.endsWith(".vercel.app") && !host.endsWith(".vercel.app")) {
          // Cross-deployment mutation blocked.
          return NextResponse.json({ success: false, error: "CSRF validation failed" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ success: false, error: "CSRF validation failed" }, { status: 403 });
      }
    }
    return null;
  }

  if (referer) {
    try {
      const r = new URL(referer);
      if (r.host !== host && !r.host.endsWith(".vercel.app")) {
        return NextResponse.json({ success: false, error: "CSRF validation failed" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ success: false, error: "CSRF validation failed" }, { status: 403 });
    }
  }
  return null;
}

function buildCsp(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://checkout.razorpay.com https://api.razorpay.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://api.razorpay.com https://lumberjack.razorpay.com https://api.eka.care https://meet.jit.si wss://meet.jit.si https://medlum-mirotalk-p2p.onrender.com wss://medlum-mirotalk-p2p.onrender.com",
    "frame-src 'self' https://meet.jit.si https://*.jit.si https://medlum-mirotalk-p2p.onrender.com https://api.razorpay.com https://checkout.razorpay.com",
    "media-src 'self' blob:",
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
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
    'camera=(self "https://meet.jit.si" "https://medlum-mirotalk-p2p.onrender.com"), microphone=(self "https://meet.jit.si" "https://medlum-mirotalk-p2p.onrender.com"), geolocation=(self), payment=()'
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // Clinical/API responses must not be stored by browsers or intermediary caches.
  // This complements route-level no-store usage and protects against accidental
  // caching of authenticated patient/clinical data.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
  }

  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    response.headers.set("Content-Security-Policy", buildCsp());
  }

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
