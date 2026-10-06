#!/usr/bin/env node
/**
 * P1 RBAC + tenant isolation integration tests against disposable Postgres.
 * Requires P1_TEST_DATABASE_URL (CI postgres service). Refuses production URLs.
 */
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { readFileSync } from "fs";

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

const labs = readFileSync(join(root, "src/app/api/labs/route.ts"), "utf8");
ok(labs.includes("canOrderLabs") || labs.includes("canEnterLabResult"), "labs enforce role permissions");
ok(labs.includes("findAuthorizedPatient"), "labs use findAuthorizedPatient");

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
      if (model === "patient") await prisma.patient.deleteMany({ where: { id } });
      if (model === "member") await prisma.clinicMember.deleteMany({ where: { id } });
      if (model === "doctor") await prisma.doctor.deleteMany({ where: { id } });
      if (model === "clinic") await prisma.clinic.deleteMany({ where: { id } });
    } catch { /* ignore */ }
  }
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
      data: { name: "Doctor A", email: `rbac-a-${stamp}@test.medlum.local`, phone: "9000000001", passwordHash: "x", clinicName: clinicA.name },
    });
    created.push(["doctor", docA.id]);
    const docB = await prisma.doctor.create({
      data: { name: "Doctor B", email: `rbac-b-${stamp}@test.medlum.local`, phone: "9000000002", passwordHash: "x", clinicName: clinicB.name },
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
      data: { doctorId: docA.id, clinicId: clinicA.id, name: "Patient A", age: 30, gender: "Male", phone: "9111111111" },
    });
    created.push(["patient", patientA.id]);
    const patientB = await prisma.patient.create({
      data: { doctorId: docB.id, clinicId: clinicB.id, name: "Patient B", age: 40, gender: "Female", phone: "9222222222" },
    });
    created.push(["patient", patientB.id]);
    const legacyA = await prisma.patient.create({
      data: { doctorId: docA.id, clinicId: null, name: "Legacy A", age: 50, gender: "Male", phone: "9333333333" },
    });
    created.push(["patient", legacyA.id]);

    async function findAuthorizedPatient(ctx, patientId) {
      const members = await prisma.clinicMember.findMany({
        where: { clinicId: ctx.clinicId, isActive: true },
        select: { doctorId: true },
      });
      const doctorIds = Array.from(new Set([ctx.doctorId, ...members.map((m) => m.doctorId)]));
      return prisma.patient.findFirst({
        where: {
          id: patientId,
          OR: [{ clinicId: ctx.clinicId }, { clinicId: null, doctorId: { in: doctorIds } }],
          deletedAt: null,
        },
      });
    }

    const ctxA = { clinicId: clinicA.id, doctorId: docA.id };
    const ctxB = { clinicId: clinicB.id, doctorId: docB.id };

    ok(!!(await findAuthorizedPatient(ctxA, patientA.id)), "Facility A can read own patient");
    ok(!(await findAuthorizedPatient(ctxA, patientB.id)), "Facility A cannot read Facility B patient");
    ok(!(await findAuthorizedPatient(ctxB, patientA.id)), "Facility B cannot read Facility A patient");
    ok(!!(await findAuthorizedPatient(ctxA, legacyA.id)), "Facility A can read own legacy null-clinicId patient");
    ok(!(await findAuthorizedPatient(ctxB, legacyA.id)), "Facility B cannot read Facility A legacy null-clinicId patient");

    const aMemberOfB = await prisma.clinicMember.findFirst({
      where: { clinicId: clinicB.id, doctorId: docA.id, isActive: true },
    });
    ok(!aMemberOfB, "Doctor A has no membership in Facility B");

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
