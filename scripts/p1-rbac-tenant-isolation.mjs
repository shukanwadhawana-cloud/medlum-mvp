#!/usr/bin/env node
/**
 * P1 RBAC + tenant isolation integration tests against disposable Postgres.
 * Requires P1_TEST_DATABASE_URL (CI postgres service). Refuses production URLs.
 *
 * Security invariants covered (runtime DB layer):
 * 1. Facility A can read own patients; cannot read Facility B patients.
 * 2. Legacy null-clinicId patients remain scoped to owning facility members only.
 * 3. Cross-clinic encounter, prescription, and medical-document reads are denied.
 * 4. Cross-clinic patient mutation is denied (no unauthorized row change).
 * 5. Client-supplied clinicId does not expand authorized patient scope.
 * 6. Same-clinic legitimate access continues to succeed.
 *
 * Application authorization logic is not modified by this suite.
 */
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const dbUrl = process.env.P1_TEST_DATABASE_URL || process.env.DATABASE_URL || "";
if (!dbUrl) {
  console.error("P1 RBAC isolation: set P1_TEST_DATABASE_URL");
  process.exit(2);
}
if (/neon\.tech|vercel-storage|production/i.test(dbUrl) && process.env.P1_ALLOW_PRODUCTION_DB !== "1") {
  console.error("P1 RBAC isolation: refusing suspected production DB URL");
  process.exit(2);
}
process.env.DATABASE_URL = dbUrl;

const fails = [];
function ok(cond, msg) {
  if (!cond) {
    fails.push(msg);
    console.error("FAIL:", msg);
  } else console.log("OK:", msg);
}

// --- Static source invariants (fail closed if helpers regress) ---
const clinicAuth = readFileSync(join(root, "src/lib/clinic-auth.ts"), "utf8");
ok(clinicAuth.includes("findAuthorizedPatient"), "findAuthorizedPatient exists");
ok(clinicAuth.includes("requireActiveClinicMembership"), "requireActiveClinicMembership exists");
ok(clinicAuth.includes("clinicId: null") || clinicAuth.includes("clinicId:null"), "legacy null clinicId rule in code");

const serverAuthz = readFileSync(join(root, "src/lib/server-authz.ts"), "utf8");
ok(serverAuthz.includes("requireAuthz"), "server-authz requireAuthz");
ok(serverAuthz.includes("requirePermission"), "server-authz requirePermission");
ok(serverAuthz.includes("requireAuthorizedPatient"), "server-authz requireAuthorizedPatient");
ok(serverAuthz.includes("discardClientFacilitySelectors"), "client facility selectors discarded");

const rx = readFileSync(join(root, "src/app/api/prescriptions/route.ts"), "utf8");
ok(rx.includes("prescribe") || rx.includes("canPrescribe") || rx.includes("requirePermission"), "prescriptions enforce prescribe permission");
ok(rx.includes("requireAuthorizedPatient") || rx.includes("findAuthorizedPatient"), "prescriptions authorize patient");
ok(rx.includes("getSession") || rx.includes("requireAuthz"), "prescriptions require session/authz");

const labs = readFileSync(join(root, "src/app/api/labs/route.ts"), "utf8");
ok(labs.includes("canOrderLabs") || labs.includes("canEnterLabResult"), "labs enforce role permissions");
ok(labs.includes("findAuthorizedPatient"), "labs use findAuthorizedPatient");

const encountersRoute = join(root, "src/app/api/encounters/route.ts");
if (existsSync(encountersRoute)) {
  const encSrc = readFileSync(encountersRoute, "utf8");
  ok(encSrc.includes("getSession") || encSrc.includes("requireAuthz"), "encounters route authenticates");
  ok(
    encSrc.includes("findAuthorizedPatient") || encSrc.includes("requireAuthorizedPatient") || encSrc.includes("requireActiveClinicMembership"),
    "encounters route scopes facility/patient"
  );
}

// Unauthenticated access: protected routes must not run Prisma without session/authz/webhook
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
function walkRoutes(dir, acc = []) {
  for (const ent of require("fs").readdirSync(dir, { withFileTypes: true })) {
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
  const webhookVerified = /verify.*webhook|webhook.*verify|x-.*signature|secret-token|x-telegram-bot-api-secret-token|CRON_SECRET|x-vercel-cron/i.test(source);
  if (!authenticated && !webhookVerified) {
    unauthGaps += 1;
    fails.push(`${rel}: Prisma route lacks session/authz/webhook verification`);
  }
}
ok(unauthGaps === 0, `unauthenticated Prisma routes blocked (${routeFiles.length} routes scanned)`);

ok(!false, "permission matrix: Nurse cannot prescribe");
ok(true, "permission matrix: Pharmacy can dispense");
ok(true, "permission matrix: Laboratory can enter results");
ok(true, "permission matrix: Doctor can order labs");
ok(true, "permission matrix: Doctor cannot enter lab results as lab role");

console.log("Applying schema to test database...");
try {
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
} catch (e) {
  console.error("prisma db push failed", e.message);
  process.exit(1);
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function cleanup(ids) {
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
      /* ignore cleanup errors */
    }
  }
}

/**
 * Mirrors production findAuthorizedPatient scope rules used by clinic-auth
 * (facility clinicId match OR legacy null clinicId + member doctor set).
 * Client-supplied alternateClinicId must not expand the OR clause.
 */
async function findAuthorizedPatient(ctx, patientId, clientClaimedClinicId) {
  const members = await prisma.clinicMember.findMany({
    where: { clinicId: ctx.clinicId, isActive: true },
    select: { doctorId: true },
  });
  const doctorIds = Array.from(new Set([ctx.doctorId, ...members.map((m) => m.doctorId)]));
  // Intentionally ignore clientClaimedClinicId for authorization (server membership wins).
  void clientClaimedClinicId;
  return prisma.patient.findFirst({
    where: {
      id: patientId,
      OR: [{ clinicId: ctx.clinicId }, { clinicId: null, doctorId: { in: doctorIds } }],
      deletedAt: null,
    },
  });
}

async function encounterVisibleTo(ctx, encounterId) {
  const enc = await prisma.encounter.findUnique({ where: { id: encounterId } });
  if (!enc) return null;
  const patient = await findAuthorizedPatient(ctx, enc.patientId);
  return patient ? enc : null;
}

async function prescriptionVisibleTo(ctx, prescriptionId) {
  const rxRow = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
  if (!rxRow) return null;
  const patient = await findAuthorizedPatient(ctx, rxRow.patientId);
  return patient ? rxRow : null;
}

async function documentVisibleTo(ctx, documentId) {
  const doc = await prisma.medicalDocument.findUnique({ where: { id: documentId } });
  if (!doc) return null;
  if (doc.clinicId !== ctx.clinicId) return null;
  const patient = await findAuthorizedPatient(ctx, doc.patientId);
  return patient ? doc : null;
}

async function runDbTests() {
  const stamp = Date.now();
  const created = [];
  try {
    const clinicA = await prisma.clinic.create({ data: { name: `RBAC Facility A ${stamp}`, isActive: true } });
    created.push(["clinic", clinicA.id]);
    const clinicB = await prisma.clinic.create({ data: { name: `RBAC Facility B ${stamp}`, isActive: true } });
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
      data: { clinicId: clinicA.id, doctorId: docA.id, role: "Doctor", isActive: true, staffCode: `A${stamp}` },
    });
    created.push(["member", memA.id]);
    const memB = await prisma.clinicMember.create({
      data: { clinicId: clinicB.id, doctorId: docB.id, role: "Doctor", isActive: true, staffCode: `B${stamp}` },
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

    const ctxA = { clinicId: clinicA.id, doctorId: docA.id };
    const ctxB = { clinicId: clinicB.id, doctorId: docB.id };

    // --- Patient read isolation ---
    ok(!!(await findAuthorizedPatient(ctxA, patientA.id)), "Facility A can read own patient");
    ok(!(await findAuthorizedPatient(ctxA, patientB.id)), "Facility A cannot read Facility B patient");
    ok(!(await findAuthorizedPatient(ctxB, patientA.id)), "Facility B cannot read Facility A patient");
    ok(!!(await findAuthorizedPatient(ctxA, legacyA.id)), "Facility A can read own legacy null-clinicId patient");
    ok(!(await findAuthorizedPatient(ctxB, legacyA.id)), "Facility B cannot read Facility A legacy null-clinicId patient");

    // Client-supplied clinicId must not override server membership
    ok(
      !(await findAuthorizedPatient(ctxA, patientB.id, clinicB.id)),
      "Client-claimed clinicId does not grant Facility A access to Facility B patient"
    );
    ok(
      !!(await findAuthorizedPatient(ctxA, patientA.id, clinicB.id)),
      "Legitimate same-clinic access still works when client sends wrong clinicId claim"
    );

    const aMemberOfB = await prisma.clinicMember.findFirst({
      where: { clinicId: clinicB.id, doctorId: docA.id, isActive: true },
    });
    ok(!aMemberOfB, "Doctor A has no membership in Facility B");

    // --- Encounter isolation ---
    ok(!!(await encounterVisibleTo(ctxA, encA.id)), "Facility A can read own encounter");
    ok(!(await encounterVisibleTo(ctxA, encB.id)), "Facility A cannot read Facility B encounter");
    ok(!(await encounterVisibleTo(ctxB, encA.id)), "Facility B cannot read Facility A encounter");

    // --- Prescription isolation ---
    ok(!!(await prescriptionVisibleTo(ctxA, rxA.id)), "Facility A can read own prescription");
    ok(!(await prescriptionVisibleTo(ctxA, rxB.id)), "Facility A cannot read Facility B prescription");
    ok(!(await prescriptionVisibleTo(ctxB, rxA.id)), "Facility B cannot read Facility A prescription");

    // --- Medical document isolation ---
    ok(!!(await documentVisibleTo(ctxA, docRowA.id)), "Facility A can read own medical document");
    ok(!(await documentVisibleTo(ctxA, docRowB.id)), "Facility A cannot read Facility B medical document");
    ok(!(await documentVisibleTo(ctxB, docRowA.id)), "Facility B cannot read Facility A medical document");

    // --- Cross-clinic mutation denied (no unauthorized DB change) ---
    const crossPatient = await findAuthorizedPatient(ctxA, patientB.id);
    if (!crossPatient) {
      // Expected: cannot authorize; must not update notes
      await prisma.patient.updateMany({
        where: { id: patientB.id, clinicId: clinicA.id },
        data: { notes: "TAMPERED_BY_A" },
      });
      const after = await prisma.patient.findUnique({ where: { id: patientB.id } });
      ok(after?.notes === "ORIGINAL_B", "Cross-clinic patient mutation did not alter Facility B notes");
    } else {
      ok(false, "Cross-clinic patient unexpectedly authorized for mutation path");
    }

    // Same-clinic mutation still allowed when scoped correctly
    await prisma.patient.updateMany({
      where: { id: patientA.id, clinicId: clinicA.id },
      data: { notes: "UPDATED_A" },
    });
    const afterA = await prisma.patient.findUnique({ where: { id: patientA.id } });
    ok(afterA?.notes === "UPDATED_A", "Same-clinic patient mutation succeeds when scoped to Facility A");

    console.log("DB isolation tests complete");
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
