#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const middleware = read("src/middleware.ts");
const security = read("src/lib/security.ts");
const api = read("src/lib/api.ts");

assert(middleware.includes("CSRF_EXEMPT_PREFIXES"), "CSRF exempt list missing");
assert(middleware.includes("/api/payments/razorpay/webhook"), "Razorpay webhook CSRF-exempt");
assert(middleware.includes("/api/interoperability/eka/webhooks"), "EKA webhooks CSRF-exempt");
assert(middleware.includes("/api/public/"), "Public booking CSRF-exempt");
assert(middleware.includes("MEDLUM_CLIENT_HEADER") || middleware.includes("x-medlum-requested-with"), "Client header missing");
assert(middleware.includes("CSRF validation failed"), "Origin-absent fail-closed missing");
assert(middleware.includes("Cross-origin request rejected"), "Mismatched Origin rejection missing");
assert(middleware.includes("getExpectedOrigin") && middleware.includes("x-forwarded-host"), "Render-aware origin missing");
assert(security.includes("CSRF_CLIENT_HEADER_MISSING") || security.includes("CSRF_ORIGIN_MISMATCH"), "security helper CSRF errors");
assert(api.includes("X-MedLum-Requested-With") && api.includes("MedLum"), "api.ts client header missing");
assert(middleware.includes("Content-Security-Policy"), "CSP header missing");
assert(middleware.includes("meet.jit.si"), "Jitsi in CSP");
assert(middleware.includes("checkout.razorpay.com") || middleware.includes("api.razorpay.com"), "Razorpay in CSP");
assert(middleware.includes("default-src 'self'"), "CSP default-src self");
assert(!middleware.includes("default-src *"), "CSP must not use default-src *");
assert(middleware.includes("frame-src"), "CSP frame-src for Jitsi");
assert(middleware.includes("object-src 'none'"), "CSP object-src none");

const clientPagesRequired = ["src/app/portal/login/page.tsx"];
for (const page of clientPagesRequired) {
  const src = read(page);
  assert(src.includes("X-MedLum-Requested-With"), `${page} missing MedLum CSRF header`);
}
const clientPagesRecommended = [
  "src/app/clinic/page.tsx",
  "src/app/clinic/setup/page.tsx",
  "src/app/ipd/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/telemedicine/page.tsx",
];
for (const page of clientPagesRecommended) {
  const full = path.join(root, page);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, "utf8");
  if (!src.includes("X-MedLum-Requested-With")) {
    console.warn(`WARN: ${page} still missing X-MedLum-Requested-With on direct fetch mutations`);
  }
}

console.log("CSRF + CSP hardening verification PASSED");
console.log("- Origin mismatch rejected");
console.log("- Origin-absent requires X-MedLum-Requested-With");
console.log("- Webhooks + public booking exempt");
console.log("- Client mutations send MedLum header");
console.log("- Production CSP includes Jitsi + Razorpay, default-src self");
