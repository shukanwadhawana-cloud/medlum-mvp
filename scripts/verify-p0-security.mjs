#!/usr/bin/env node
/**
 * Static verification of P0 authentication hardening.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const signup = read("src/app/api/auth/signup/route.ts");
const login = read("src/app/api/auth/login/route.ts");
const authConfig = read("src/lib/auth-config.ts");
const rateLimit = read("src/lib/rate-limit.ts");
const sessionSecret = read("src/lib/session-secret.ts");
const session = read("src/lib/session.ts");
const portalLogin = read("src/app/api/portal/auth/login/route.ts");
const portalReset = read("src/app/api/portal/auth/reset/route.ts");
const portalAccounts = read("src/app/api/portal/accounts/route.ts");
const schema = read("prisma/schema.prisma");
const env = read(".env.example");

assert(authConfig.includes("ALLOW_PUBLIC_SIGNUP"), "signup gate env missing");
assert(authConfig.includes("isProductionRuntime"), "production runtime check missing");
assert(signup.includes("isPublicSignupAllowed"), "signup not gated");
assert(signup.includes("status: 403"), "blocked signup must 403");
assert(signup.includes("consumeRateLimit"), "signup rate limit missing");
assert(login.includes("consumeRateLimit"), "login rate limit missing");
assert(portalLogin.includes("consumeRateLimit"), "portal login rate limit missing");
assert(portalReset.includes("consumeRateLimit"), "portal reset rate limit missing");
assert(rateLimit.includes("authRateLimit"), "DB rate limit model usage missing");
assert(rateLimit.includes("Too many attempts"), "429 messaging missing");
assert(sessionSecret.includes("SESSION_SECRET must be configured"), "prod secret fail-closed missing");
assert(session.includes("resolveSessionSecretBytes"), "session must use shared secret helper");
assert(schema.includes("model PatientPortalAccount"), "PatientPortalAccount model missing");
assert(schema.includes("model AuthRateLimit"), "AuthRateLimit model missing");
assert(portalAccounts.includes("patientPortalAccount"), "portal accounts must use Prisma client");
assert(portalLogin.includes("patientPortalAccount"), "portal login must use Prisma client");
assert(!portalAccounts.includes("$executeRaw"), "portal accounts must not use raw SQL");
assert(!portalLogin.includes("$queryRaw"), "portal login must not use raw SQL");
assert(env.includes("ALLOW_PUBLIC_SIGNUP"), ".env.example must document signup gate");
assert(
  fs.existsSync(path.join(root, "prisma/migrations/20260916040000_p0_portal_schema_and_auth_rate_limit/migration.sql")),
  "migration missing"
);

const apiTree = [];
function walk(d) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".ts")) apiTree.push(p);
  }
}
walk(path.join(root, "src/app/api"));
for (const file of apiTree) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("prisma.doctor.create") && !rel.includes("auth/signup")) {
    throw new Error(`Unexpected doctor.create outside signup: ${rel}`);
  }
}

console.log("P0 security verification PASSED");
console.log("- Production signup fail-closed (ALLOW_PUBLIC_SIGNUP)");
console.log("- Auth rate limiting on login/signup/portal");
console.log("- SESSION_SECRET production hardening");
console.log("- PatientPortalAccount + AuthRateLimit in Prisma");
console.log("- Portal routes use Prisma (no raw SQL)");
