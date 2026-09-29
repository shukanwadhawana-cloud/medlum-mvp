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
  else { failures.push(message); console.error("FAIL:", message); }
};
const warn = (condition, message) => {
  if (condition) console.log("OK:", message);
  else { warnings.push(message); console.warn("WARN:", message); }
};

const middleware = read("src/middleware.ts");
const session = read("src/lib/session.ts");
const logout = read("src/app/api/auth/logout/route.ts");
const clinicAuth = read("src/lib/clinic-auth.ts");
const securityRegression = read("scripts/verify-p1-security-regression.mjs");
const schema = read("prisma/schema.prisma");
const cron = read("src/app/api/cron/pilot-access/route.ts");

ok(session.includes("httpOnly: true"), "session cookie is HttpOnly");
ok(session.includes('secure: process.env.NODE_ENV === "production"'), "session cookie is Secure in production");
ok(session.includes('sameSite: "lax"'), "session cookie uses SameSite=Lax");
ok(session.includes("setExpirationTime"), "session has an explicit JWT expiration");
ok(session.includes("doctor.isActive"), "session rechecks server-side account activation");
ok(session.includes("randomUUID"), "each login creates a unique server-side session identifier");
ok(session.includes("sid: sessionId") && session.includes(".setJti(sessionId)"), "JWT carries a server-side session identifier");
ok(session.includes("prisma.authSession.findUnique"), "authenticated JWTs are checked against server-side session state");
ok(session.includes("authSession.revokedAt") && session.includes("authSession.expiresAt"), "server-side revocation and expiry are enforced");
ok(session.includes("export async function revokeSession"), "session revocation primitive exists");

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
ok(logout.includes("revokeSession(session.sessionId, session.doctorId)"), "logout revokes the server-side session before clearing the cookie");
ok(schema.includes("model AuthSession") && schema.includes("revokedAt DateTime?"), "database stores revocable authentication sessions");
ok(cron.includes("CRON_SECRET") && cron.includes("Bearer"), "scheduled pilot mutation requires CRON_SECRET bearer authentication");

ok(clinicAuth.includes("requireActiveClinicMembership"), "facility scope is resolved server-side from membership");
ok(clinicAuth.includes("OR: [{ clinicId: ctx.clinicId }, { doctorId: ctx.doctorId, clinicId: null }]"), "legacy patient rows remain constrained to the authenticated actor/facility");
ok(securityRegression.includes("! /clinicId".replace(" ", "")) || securityRegression.includes("! /clinicId:\\s*body\\./"), "P1 regression suite checks client clinicId authority");

warn(session.includes("prisma.authSession.findUnique") && logout.includes("revokeSession("), "server-side revocation is wired into both session validation and logout");

console.log(`\nASVS 5.0 hardening verification: ${failures.length ? "FAILED" : "PASSED"}`);
if (warnings.length) {
  console.log(`Open hardening warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(" -", warning);
}
if (failures.length) process.exit(1);
