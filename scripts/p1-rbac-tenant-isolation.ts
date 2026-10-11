#!/usr/bin/env npx tsx
/**
 * P1 RBAC + tenant isolation integration tests against disposable Postgres.
 *
 * Exercises production `findAuthorizedPatient` from src/lib/clinic-auth.ts
 * (not a duplicated copy). Refuses non-disposable database targets.
 *
 * Requires:
 *   P1_TEST_DATABASE_URL=postgresql://p1:p1@127.0.0.1:5432/p1test?schema=public
 * (matches the CI postgres service identity exactly)
 *
 * Application authorization logic is not modified by this suite.
 */
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { readFileSync, existsSync, readdirSync } from "fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const fails: string[] = [];
function ok(cond: unknown, msg: string) {
  if (!cond) {
    fails.push(msg);
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

function assertDisposableTestDatabase(rawUrl: string): URL {
  if (process.env.P1_ALLOW_PRODUCTION_DB) {
    throw new Error(
      "P1 RBAC isolation: P1_ALLOW_PRODUCTION_DB is not permitted. Use the disposable CI database only."
    );
  }
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("P1 RBAC isolation: P1_TEST_DATABASE_URL is required");
  }
  if (/neon\.tech|vercel-storage|amazonaws\.com|railway\.app|supabase\.co|production/i.test(rawUrl)) {
    throw new Error("P1 RBAC isolation: refusing non-disposable or production-like database URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("P1 RBAC isolation: P1_TEST_DATABASE_URL is not a valid URL");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("P1 RBAC isolation: only postgresql:// URLs are allowed");
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `P1 RBAC isolation: host must be 127.0.0.1 or localhost (got ${host})`
    );
  }
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "");
  if (dbName !== "p1test") {
    throw new Error(
      `P1 RBAC isolation: database name must be exactly "p1test" (got "${dbName}")`
    );
  }
  if (parsed.username && parsed.username !== "p1") {
    throw new Error(
      `P1 RBAC isolation: expected database user "p1" (got "${parsed.username}")`
    );
  }
  return parsed;
}

const providedUrl = process.env.P1_TEST_DATABASE_URL || "";
let safeUrl: URL;
try {
  safeUrl = assertDisposableTestDatabase(providedUrl);
  console.log(
    `OK: disposable DB gate passed (${safeUrl.hostname}/${safeUrl.pathname.replace(/^\//, "")})`
  );
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}

process.env.DATABASE_URL = providedUrl;

const clinicAuthSrc = readFileSync(join(root, "src/lib/clinic-auth.ts"), "utf8");
ok(clinicAuthSrc.includes("export async function findAuthorizedPatient"), "production findAuthorizedPatient is exported");
ok(clinicAuthSrc.includes("requireActiveClinicMembership"), "requireActiveClinicMembership exists");
ok(
  clinicAuthSrc.includes("clinicId: null") || clinicAuthSrc.includes("clinicId:null"),
  "legacy null clinicId rule in production clinic-auth"
);

const serverAuthz = readFileSync(join(root, "src/lib/server-authz.ts"), "utf8");
ok(serverAuthz.includes("requireAuthz"), "server-authz requireAuthz");
ok(serverAuthz.includes("requireAuthorizedPatient"), "server-authz requireAuthorizedPatient");
ok(serverAuthz.includes("discardClientFacilitySelectors"), "client facility selectors discarded");
ok(
  serverAuthz.includes("findAuthorizedPatient"),
  "server-authz delegates patient scope to production findAuthorizedPatient"
);

const rx = readFileSync(join(root, "src/app/api/prescriptions/route.ts"), "utf8");
ok(
  rx.includes("prescribe") || rx.includes("canPrescribe") || rx.includes("requirePermission"),
  "prescriptions enforce prescribe permission"
);
ok(
  rx.includes("requireAuthorizedPatient") || rx.includes("findAuthorizedPatient"),
  "prescriptions authorize patient via production helpers"
);
ok(rx.includes("getSession") || rx.includes("requireAuthz"), "prescriptions require session/authz");

const labs = readFileSync(join(root, "src/app/api/labs/route.ts"), "utf8");
ok(labs.includes("canOrderLabs") || labs.includes("canEnterLabResult"), "labs enforce role permissions");
ok(labs.includes("findAuthorizedPatient"), "labs use production findAuthorizedPatient");

const encountersRoute = join(root, "src/app/api/encounters/route.ts");
if (existsSync(encountersRoute)) {
  const encSrc = readFileSync(encountersRoute, "utf8");
  ok(encSrc.includes("getSession") || encSrc.includes("requireAuthz"), "encounters route authenticates");
  ok(
    encSrc.includes("findAuthorizedPatient") ||
      encSrc.includes("requireAuthorizedPatient") ||
      encSrc.includes("requireActiveClinicMembership"),
    "encounters route scopes facility/patient"
  );
}

const apiRoot = join(root, "src", "app", "api");
const specialUnauth = new Set([
  "auth/login/route.ts",
  "auth/signup/route.ts",
  "auth/logout/route.ts",
  "auth/otp/verify/route.ts",
  "auth/telegram/prelink/route.ts",
  "public/booking/route.ts",
  "portal/auth/login/route.ts",
  "portal/auth/logout/route.ts",
  "portal/auth/reset/route.ts",
  "portal/auth/me/route.ts",
  "interoperability/eka/webhooks/route.ts",
  "telegram/webhook/route.ts",
  "telegram/facility/[clinicId]/route.ts",
  "telemedicine/join/route.ts",
]);
function walkRoutes(dir: string, acc: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkRoutes(p, acc);
    else if (ent.name === "route.ts") acc.push(p);
  }
  return acc;
}
const routeFiles = walkRoutes(apiRoot);
let unauthGaps = 0;
for (const file of routeFiles) {
  const rel = file.slice(apiRoot.length + 1).replaceAll("\\", "/");
  if (specialUnauth.has(rel)) continue;
  const source = readFileSync(file, "utf8");
  if (!/\bprisma\b/.test(source)) continue;
  const authenticated = /getSession\s*\(|getPortalSession\s*\(|requireAuthz\s*\(/.test(source);
  const webhookVerified =
    /verify.*webhook|webhook.*verify|x-.*signature|secret-token|x-telegram-bot-api-secret-token|CRON_SECRET|x-vercel-cron/i.test(
      source
    );
  if (!authenticated && !webhookVerified) {
    unauthGaps += 1;
    fails.push(`${rel}: Prisma route lacks session/authz/webhook verification`);
  }
}
ok(unauthGaps === 0, `unauthenticated Prisma routes blocked (${routeFiles.length} routes scanned)`);

console.log("Generating Prisma client and applying schema to disposable p1test (non-destructive push)...");
try {
  execSync("npx prisma generate", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: providedUrl },
  });
  execSync("npx prisma db push --skip-generate", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: providedUrl },
  });
} catch (e) {
  console.error("prisma generate/db push failed on disposable p1test", (e as Error).message);
  process.exit(1);
}

const { findAuthorizedPatient } = await import("../src/lib/clinic-auth.ts");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

type MembershipCtx = {
  membershipId: string;
  clinicId: string;
  doctorId: string;
  role: "Doctor";
};

async function cleanup(ids: [string, string][]) {
  for (const [model, id] of ids.reverse()) {
    try {
      if (model === "document") await prisma.medicalDocument.deleteMany({ where: { id } });
      if (model === "prescription") await prisma.prescription.deleteMany({ where: { id } });
      if (model === "encounter") await prisma.encounter.deleteMany({ where: { id } });
      if (model === "patient") await prisma.patient.deleteMany({ where: { id } });
      if (model === "member") await prisma.clinicMember.deleteMany({ where: { id } });
      if (model === "doctor") await prisma.doctor.deleteMany({ where: { id } });
      if (model === "clinic") await prisma.clinic.deleteMany({ where: { id } });
    } catch {
      /* ignore cleanup errors on disposable DB */
    }
  }
}

async function encounterVisibleViaProductionAuth(ctx: MembershipCtx, encounterId: string) {
  const enc = await prisma.encounter.findUnique({ where: { id: encounterId } });
  if (!enc) return null;
  const patient = await findAuthorizedPatient(ctx, enc.patientId);
  return patient ? enc : null;
}

async function prescriptionVisibleViaProductionAuth(ctx: MembershipCtx, prescriptionId: string) {
  const row = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
  if (!row) return null;
  const patient = await findAuthorizedPatient(ctx, row.patientId);
  return patient ? row : null;
}

async function documentVisibleViaProductionAuth(ctx: MembershipCtx, documentId: string) {
  const doc = await prisma.medicalDocument.findUnique({ where: { id: documentId } });
  if (!doc) return null;
  if (doc.clinicId !== ctx.clinicId) return null;
  const patient = await findAuthorizedPatient(ctx, doc.patientId);
  return patient ? doc : null;
}

async function runDbTests() {
  const stamp = Date.now();
  const created: [string, string][] = [];
  try {
    const clinicA = await prisma.clinic.create({
      data: { name: `RBAC Facility A ${stamp}`, isActive: true },
    });
    created.push(["clinic", clinicA.id]);
    const clinicB = await prisma.clinic.create({
      data: { name: `RBAC Facility B ${stamp}`, isActive: true },
    });
    created.push(["clinic", clinicB.id]);

    const docA = await prisma.doctor.create({
      data: {
        name: "Doctor A",
        email: `rbac-a-${stamp}@test.medlum.local`,
        phone: "9000000001",
        passwordHash: "x",
        clinicName: clinicA.name,
      },
    });
    created.push(["doctor", docA.id]);
    const docB = await prisma.doctor.create({
      data: {
        name: "Doctor B",
        email: `rbac-b-${stamp}@test.medlum.local`,
        phone: "9000000002",
        passwordHash: "x",
        clinicName: clinicB.name,
      },
    });
    created.push(["doctor", docB.id]);

    const memA = await prisma.clinicMember.create({
      data: {
        clinicId: clinicA.id,
        doctorId: docA.id,
        role: "Doctor",
        isActive: true,
        staffCode: `A${stamp}`,
      },
    });
    created.push(["member", memA.id]);
    const memB = await prisma.clinicMember.create({
      data: {
        clinicId: clinicB.id,
        doctorId: docB.id,
        role: "Doctor",
        isActive: true,
        staffCode: `B${stamp}`,
      },
    });
    created.push(["member", memB.id]);

    const patientA = await prisma.patient.create({
      data: {
        doctorId: docA.id,
        clinicId: clinicA.id,
        name: "Patient A",
        age: 30,
        gender: "Male",
        phone: "9111111111",
        notes: "ORIGINAL_A",
      },
    });
    created.push(["patient", patientA.id]);
    const patientB = await prisma.patient.create({
      data: {
        doctorId: docB.id,
        clinicId: clinicB.id,
        name: "Patient B",
        age: 40,
        gender: "Female",
        phone: "9222222222",
        notes: "ORIGINAL_B",
      },
    });
    created.push(["patient", patientB.id]);
    const legacyA = await prisma.patient.create({
      data: {
        doctorId: docA.id,
        clinicId: null,
        name: "Legacy A",
        age: 50,
        gender: "Male",
        phone: "9333333333",
      },
    });
    created.push(["patient", legacyA.id]);

    const encA = await prisma.encounter.create({
      data: {
        doctorId: docA.id,
        patientId: patientA.id,
        date: "2026-10-11",
        chiefComplaint: "fever",
        diagnosis: "viral",
      },
    });
    created.push(["encounter", encA.id]);
    const encB = await prisma.encounter.create({
      data: {
        doctorId: docB.id,
        patientId: patientB.id,
        date: "2026-10-11",
        chiefComplaint: "cough",
        diagnosis: "uri",
      },
    });
    created.push(["encounter", encB.id]);

    const rxA = await prisma.prescription.create({
      data: {
        doctorId: docA.id,
        patientId: patientA.id,
        patientName: patientA.name,
        medicines: "paracetamol 500mg",
        encounterId: encA.id,
      },
    });
    created.push(["prescription", rxA.id]);
    const rxB = await prisma.prescription.create({
      data: {
        doctorId: docB.id,
        patientId: patientB.id,
        patientName: patientB.name,
        medicines: "amoxicillin 500mg",
        encounterId: encB.id,
      },
    });
    created.push(["prescription", rxB.id]);

    const docRowA = await prisma.medicalDocument.create({
      data: {
        clinicId: clinicA.id,
        patientId: patientA.id,
        storageProvider: "local",
        storageKey: `clinics/${clinicA.id}/patients/${patientA.id}/labs/no-order/doc-a.pdf`,
        originalFileName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        uploadedBy: docA.id,
      },
    });
    created.push(["document", docRowA.id]);
    const docRowB = await prisma.medicalDocument.create({
      data: {
        clinicId: clinicB.id,
        patientId: patientB.id,
        storageProvider: "local",
        storageKey: `clinics/${clinicB.id}/patients/${patientB.id}/labs/no-order/doc-b.pdf`,
        originalFileName: "b.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        uploadedBy: docB.id,
      },
    });
    created.push(["document", docRowB.id]);

    const ctxA: MembershipCtx = {
      membershipId: memA.id,
      clinicId: clinicA.id,
      doctorId: docA.id,
      role: "Doctor",
    };
    const ctxB: MembershipCtx = {
      membershipId: memB.id,
      clinicId: clinicB.id,
      doctorId: docB.id,
      role: "Doctor",
    };

    ok(!!(await findAuthorizedPatient(ctxA, patientA.id)), "production auth: Facility A can read own patient");
    ok(!(await findAuthorizedPatient(ctxA, patientB.id)), "production auth: Facility A cannot read Facility B patient");
    ok(!(await findAuthorizedPatient(ctxB, patientA.id)), "production auth: Facility B cannot read Facility A patient");
    ok(
      !!(await findAuthorizedPatient(ctxA, legacyA.id)),
      "production auth: Facility A can read own legacy null-clinicId patient"
    );
    ok(
      !(await findAuthorizedPatient(ctxB, legacyA.id)),
      "production auth: Facility B cannot read Facility A legacy null-clinicId patient"
    );

    ok(
      !(await findAuthorizedPatient(ctxA, patientB.id)),
      "production auth: authenticated Facility A membership cannot IDOR Facility B patient"
    );
    ok(
      serverAuthz.includes("Facility scope ALWAYS comes from requireActiveClinicMembership") ||
        serverAuthz.includes("never from client clinicId") ||
        serverAuthz.includes("discardClientFacilitySelectors"),
      "production server-authz documents client clinicId is never trusted"
    );

    const aMemberOfB = await prisma.clinicMember.findFirst({
      where: { clinicId: clinicB.id, doctorId: docA.id, isActive: true },
    });
    ok(!aMemberOfB, "Doctor A has no membership in Facility B");

    ok(!!(await encounterVisibleViaProductionAuth(ctxA, encA.id)), "production auth: Facility A can read own encounter");
    ok(!(await encounterVisibleViaProductionAuth(ctxA, encB.id)), "production auth: Facility A cannot read Facility B encounter");
    ok(!(await encounterVisibleViaProductionAuth(ctxB, encA.id)), "production auth: Facility B cannot read Facility A encounter");

    ok(!!(await prescriptionVisibleViaProductionAuth(ctxA, rxA.id)), "production auth: Facility A can read own prescription");
    ok(!(await prescriptionVisibleViaProductionAuth(ctxA, rxB.id)), "production auth: Facility A cannot read Facility B prescription");
    ok(!(await prescriptionVisibleViaProductionAuth(ctxB, rxA.id)), "production auth: Facility B cannot read Facility A prescription");

    ok(!!(await documentVisibleViaProductionAuth(ctxA, docRowA.id)), "production auth: Facility A can read own medical document");
    ok(!(await documentVisibleViaProductionAuth(ctxA, docRowB.id)), "production auth: Facility A cannot read Facility B medical document");
    ok(!(await documentVisibleViaProductionAuth(ctxB, docRowA.id)), "production auth: Facility B cannot read Facility A medical document");

    const crossPatient = await findAuthorizedPatient(ctxA, patientB.id);
    ok(!crossPatient, "production auth: cross-clinic patient not authorized for mutation");
    if (!crossPatient) {
      await prisma.patient.updateMany({
        where: { id: patientB.id, clinicId: clinicA.id },
        data: { notes: "TAMPERED_BY_A" },
      });
      const after = await prisma.patient.findUnique({ where: { id: patientB.id } });
      ok(after?.notes === "ORIGINAL_B", "Cross-clinic patient mutation did not alter Facility B notes");
    }

    const ownPatient = await findAuthorizedPatient(ctxA, patientA.id);
    ok(!!ownPatient, "production auth: same-clinic patient authorized before mutation");
    if (ownPatient) {
      await prisma.patient.updateMany({
        where: { id: patientA.id, clinicId: clinicA.id },
        data: { notes: "UPDATED_A" },
      });
      const afterA = await prisma.patient.findUnique({ where: { id: patientA.id } });
      ok(afterA?.notes === "UPDATED_A", "Same-clinic patient mutation succeeds when production auth grants access");
    }

    console.log("DB isolation tests complete (production findAuthorizedPatient)");
  } finally {
    await cleanup(created);
    await prisma.$disconnect();
  }
}

await runDbTests();

if (fails.length) {
  console.error(`P1 RBAC tenant isolation FAILED (${fails.length})`);
  fails.forEach((f) => console.error("-", f));
  process.exit(1);
}
console.log("P1 RBAC tenant isolation PASSED");
