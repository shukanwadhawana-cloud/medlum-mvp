#!/usr/bin/env node
/**
 * Authenticated E2E foundation — static contract + non-destructive live smoke.
 * Full multi-user role matrix needs an isolated test DB (not claimed here).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function assert(c, m) { if (!c) throw new Error(m); }

const clinicAuth = fs.readFileSync(path.join(root, "src/lib/clinic-auth.ts"), "utf8");
const middleware = fs.readFileSync(path.join(root, "src/middleware.ts"), "utf8");
const portalReset = fs.readFileSync(path.join(root, "src/app/api/portal/auth/reset/route.ts"), "utf8");
const patientDetail = fs.readFileSync(path.join(root, "src/app/api/patients/[id]/route.ts"), "utf8");

assert(clinicAuth.includes("requireActiveClinicMembership"), "membership gate");
assert(clinicAuth.includes("findAuthorizedPatient"), "patient boundary");
assert(clinicAuth.includes("canResetPortalPassword"), "portal reset role gate");
assert(portalReset.includes("canResetPortalPassword"), "reset route uses gate");
assert(patientDetail.includes("canViewFullClinicalChart"), "role-scoped chart");
assert(middleware.includes("CSRF validation failed") || middleware.includes("Cross-origin"), "CSRF middleware");

console.log("E2E auth foundation — static contract OK");
console.log("Documented scenarios (isolated test DB required for full runtime matrix):");
for (const s of [
  "Doctor login → authenticated / invalid login → rejected / logout",
  "Doctor A → Clinic A patient allowed; Clinic B patient rejected",
  "Owner / Admin / Consultant / Staff role matrix",
  "Active member allowed; deactivated member rejected",
  "Portal session scoped to patient; doctor cannot impersonate portal",
  "Consultant portal reset rejected; Owner/Admin allowed",
]) console.log("  -", s);

const base = process.env.MEDLUM_APP_URL || "https://medlum-mvp.onrender.com";
const health = await fetch(`${base}/api/health`);
assert(health.ok, `health ${health.status}`);
const patients = await fetch(`${base}/api/patients`);
assert(patients.status === 401, `unauth patients expected 401 got ${patients.status}`);
const signup = await fetch(`${base}/api/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
  body: JSON.stringify({ name: "x" }),
});
assert(signup.status === 403, `signup/CSRF expected 403 got ${signup.status}`);
const csrf = await fetch(`${base}/api/patients`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
  body: "{}",
});
assert(csrf.status === 403, `cross-origin mutation expected 403 got ${csrf.status}`);
console.log(`Live smoke against ${base}: health, unauth 401, CSRF 403 — PASS`);
console.log("LIMITATION: full role-matrix E2E not run (no isolated test database).");
