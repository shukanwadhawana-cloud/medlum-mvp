#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const failures = [];
const warnings = [];
const ok = (condition, message) => {
  if (condition) console.log("OK:", message);
  else {
    failures.push(message);
    console.error("FAIL:", message);
  }
};
const warn = (condition, message) => {
  if (condition) console.log("OK:", message);
  else {
    warnings.push(message);
    console.warn("WARN:", message);
  }
};

const middleware = read("src/middleware.ts");
const session = read("src/lib/session.ts");
const logout = read("src/app/api/auth/logout/route.ts");
const clinicAuth = read("src/lib/clinic-auth.ts");
const securityRegression = read("scripts/verify-p1-security-regression.mjs");
const sessionMigration = read("prisma/migrations/20261004190000_session_invalidation/migration.sql");

// ASVS 5.0 V7/V8-oriented baseline checks for the controls already in MedLum.
ok(session.includes("httpOnly: true"), "session cookie is HttpOnly");
ok(session.includes('secure: process.env.NODE_ENV === "production"'), "session cookie is Secure in production");
ok(session.includes('sameSite: "lax"'), "session cookie uses SameSite=Lax");
ok(session.includes("setExpirationTime"), "session has an explicit JWT expiration");
ok(session.includes("sessionInvalidatedAt") && session.includes("revokeSession"), "server-side session invalidation is enforced");
ok(sessionMigration.includes("sessionInvalidatedAt") && sessionMigration.includes("ADD COLUMN IF NOT EXISTS"), "session invalidation migration is additive and non-destructive");
ok(session.includes("doctor.isActive"), "session rechecks server-side account activation");

ok(middleware.includes("Cross-origin request rejected"), "cross-origin mutation requests are rejected");
ok(middleware.includes("CSRF validation failed"), "origin-absent mutations require the MedLum request header");
ok(middleware.includes("Content-Security-Policy"), "production CSP is configured");
ok(middleware.includes("default-src 'self'"), "CSP default-src is self");
ok(middleware.includes("object-src 'none'"), "CSP disables plugin/object execution");
ok(middleware.includes("Strict-Transport-Security"), "production HSTS is configured");
ok(middleware.includes("X-Content-Type-Options"), "MIME sniffing protection is configured");
ok(middleware.includes('Cache-Control", "no-store, max-age=0'), "API responses are explicitly no-store");
ok(middleware.includes('Pragma", "no-cache'), "API responses include legacy no-cache protection");

ok(logout.includes("Clear-Site-Data") && logout.includes("Cache-Control"), "logout clears browser cache/storage and is non-cacheable");

ok(clinicAuth.includes("requireActiveClinicMembership"), "facility scope is resolved server-side from membership");
ok(
  clinicAuth.includes("findAuthorizedPatient") &&
    clinicAuth.includes("id: patientId") &&
    clinicAuth.includes("clinicId: ctx.clinicId") &&
    clinicAuth.includes("doctorId: { in: doctorIds }"),
  "patient lookup is constrained to the authenticated facility and authorized legacy owner"
);
ok(
  securityRegression.includes("! /clinicId".replace(" ", "")) ||
    securityRegression.includes("! /clinicId:\\s*body\\./"),
  "P1 regression suite checks client clinicId authority"
);

// Session invalidation is now a required control: logout invalidates the token family
// for that doctor, while inactive accounts remain fail-closed.

console.log(`\\nASVS 5.0 hardening verification: ${failures.length ? "FAILED" : "PASSED"}`);
if (warnings.length) {
  console.log(`Open hardening warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(" -", warning);
}
if (failures.length) process.exit(1);
