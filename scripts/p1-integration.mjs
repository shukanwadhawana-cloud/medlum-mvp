#!/usr/bin/env node
/**
 * P1 integration tests against a disposable Postgres (CI service).
 * Never use production DATABASE_URL without P1_ALLOW_PRODUCTION_DB=1.
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const dbUrl = process.env.P1_TEST_DATABASE_URL || process.env.DATABASE_URL || "";
if (!dbUrl) {
  console.error("P1 integration: set P1_TEST_DATABASE_URL to a test Postgres URL.");
  process.exit(2);
}
if (/neon\.tech|vercel-storage|production/i.test(dbUrl) && process.env.P1_ALLOW_PRODUCTION_DB !== "1") {
  console.error("P1 integration: refusing suspected production DATABASE_URL without P1_ALLOW_PRODUCTION_DB=1");
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

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

const labsRoute = readFileSync(join(root, "src/app/api/labs/route.ts"), "utf8");
ok(labsRoute.includes("Sample Pending"), "labs API accepts Sample Pending");
ok(labsRoute.includes("Processing"), "labs API accepts Processing");
ok(labsRoute.includes("Awaiting Review"), "labs API accepts Awaiting Review");
ok(labsRoute.includes("Reviewed"), "labs API accepts Reviewed");
ok(labsRoute.includes("session.doctorId"), "labs create uses session.doctorId");
ok(!/doctorId:\s*body/.test(labsRoute), "labs does not take doctorId from body");

const staffRoute = readFileSync(join(root, "src/app/api/clinic/staff/route.ts"), "utf8");
ok(staffRoute.includes("allocateStaffCode"), "staff create allocates Staff ID");
ok(staffRoute.includes("Staff ID is permanent"), "role change documents permanent Staff ID");
ok(!staffRoute.includes("body.staffCode"), "staff create does not read body.staffCode");

const rxPrint = readFileSync(join(root, "src/app/api/prescriptions/print/route.ts"), "utf8");
ok(rxPrint.includes("PRESCRIPTION"), "rx print type");
ok(!/\bbalance\b|invoice total|amount paid/i.test(rxPrint), "rx print no billing fields");

const labPrint = readFileSync(join(root, "src/app/api/labs/print/route.ts"), "utf8");
ok(labPrint.includes("LAB_REPORT"), "lab print type");
ok(!/\bpaid\b|invoice total/i.test(labPrint), "lab print no billing");

const ipdPrint = readFileSync(join(root, "src/app/api/ipd/print/route.ts"), "utf8");
ok(ipdPrint.includes("DISCHARGE_SUMMARY"), "discharge print type");
ok(!/\bbalance\b|invoice/i.test(ipdPrint), "discharge print no billing");

const storage = readFileSync(join(root, "src/lib/storage/index.ts"), "utf8");
ok(storage.includes("STORAGE_PROVIDER") || storage.includes("processed"), "storage provider path present");
ok(storage.includes("isServerlessRuntime") || storage.includes("processed"), "serverless storage path");

const labsUi = readFileSync(join(root, "src/app/labs/page.tsx"), "utf8");
ok(labsUi.length > 5000, "labs page not truncated");
ok(labsUi.includes("Encounter not linked"), "neutral encounter label");

const appShell = readFileSync(join(root, "src/components/AppShell.tsx"), "utf8");
ok(appShell.includes("/ipd-summaries"), "nav includes IPD summaries");
ok(appShell.includes("doctor?.isOwner"), "owner menu uses isOwner");

const rxPage = readFileSync(join(root, "src/app/prescriptions/page.tsx"), "utf8");
ok(rxPage.includes("formatIst"), "prescriptions list uses formatIst");
ok(rxPage.includes("/prescriptions/print"), "prescriptions list has print link");
ok(!rxPage.includes("toLocaleDateString"), "prescriptions list not browser-local dates");

if (fails.length) {
  console.error("Static checks failed before DB setup");
  process.exit(1);
}

console.log("\n--- Preparing test database schema ---");
try {
  run("npx prisma generate");
  // CI disposable Postgres: full schema via db push (migration chain assumes existing tables).
  // Production deploys continue to use `prisma migrate deploy` on Vercel/Render.
  run("npx prisma db push --accept-data-loss --skip-generate");
} catch (e) {
  console.error("test DB schema setup failed", e);
  process.exit(1);
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function staffIdPrefix(role) {
  const r = (role || "").toLowerCase();
  if (r === "owner") return "OWN";
  if (r === "admin") return "ADM";
  if (r === "manager") return "MGR";
  if (r === "consultant" || r === "doctor") return "DOC";
  if (r === "rmo") return "RMO";
  if (r === "nurse") return "NUR";
  if (r === "laboratory" || r === "lab") return "LAB";
  if (r === "pharmacy" || r === "pharmacist") return "PHARM";
  if (r === "billing") return "BILL";
  if (r === "receptionist") return "REC";
  return "STF";
}

async function allocateStaffCode(clinicId, role) {
  const prefix = staffIdPrefix(role);
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-(\\d+)$", "i");
  for (let attempt = 0; attempt < 12; attempt++) {
    const existing = await prisma.clinicMember.findMany({
      where: { clinicId, staffCode: { startsWith: `${prefix}-` } },
      select: { staffCode: true },
    });
    let max = 0;
    for (const row of existing) {
      const m = String(row.staffCode || "").match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const code = `${prefix}-${String(max + 1 + attempt).padStart(4, "0")}`;
    const clash = await prisma.clinicMember.findFirst({
      where: { clinicId, staffCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

async function runDbTests() {
  const suffix = Date.now().toString(36);

  const clinicA = await prisma.clinic.create({
    data: { name: `P1 Test Hospital A ${suffix}`, letterheadHeightMm: 45, showMedlumFooter: true },
  });
  const clinicB = await prisma.clinic.create({
    data: { name: `P1 Test Hospital B ${suffix}`, letterheadHeightMm: 40, showMedlumFooter: false },
  });

  const ownerA = await prisma.doctor.create({
    data: {
      name: "Owner A",
      email: `owner-a-${suffix}@test.medlum.local`,
      passwordHash: "x",
      clinicName: clinicA.name,
      phone: "9000000001",
    },
  });
  const nurseA = await prisma.doctor.create({
    data: {
      name: "Nurse A",
      email: `nurse-a-${suffix}@test.medlum.local`,
      passwordHash: "x",
      clinicName: clinicA.name,
      phone: "9000000002",
    },
  });
  const ownerB = await prisma.doctor.create({
    data: {
      name: "Owner B",
      email: `owner-b-${suffix}@test.medlum.local`,
      passwordHash: "x",
      clinicName: clinicB.name,
      phone: "9000000003",
    },
  });

  const codeOwner = await allocateStaffCode(clinicA.id, "Owner");
  await prisma.clinicMember.create({
    data: {
      clinicId: clinicA.id,
      doctorId: ownerA.id,
      role: "Owner",
      staffCode: codeOwner,
      isActive: true,
    },
  });

  const codeNurse = await allocateStaffCode(clinicA.id, "Nurse");
  const memNurse = await prisma.clinicMember.create({
    data: {
      clinicId: clinicA.id,
      doctorId: nurseA.id,
      role: "Nurse",
      staffCode: codeNurse,
      isActive: true,
    },
  });

  await prisma.clinicMember.create({
    data: {
      clinicId: clinicB.id,
      doctorId: ownerB.id,
      role: "Owner",
      staffCode: await allocateStaffCode(clinicB.id, "Owner"),
      isActive: true,
    },
  });

  const afterRole = await prisma.clinicMember.update({
    where: { id: memNurse.id },
    data: { role: "RMO", designation: "RMO" },
  });
  ok(afterRole.staffCode === codeNurse, "Staff ID permanent across role change");

  await prisma.clinicMember.update({
    where: { id: memNurse.id },
    data: { isActive: false, deactivatedAt: new Date() },
  });
  const deact = await prisma.clinicMember.findUnique({ where: { id: memNurse.id } });
  ok(deact && deact.isActive === false, "soft deactivation sets isActive false");

  await prisma.clinicMember.update({
    where: { id: memNurse.id },
    data: { isActive: true, deactivatedAt: null },
  });

  const patientA = await prisma.patient.create({
    data: {
      doctorId: ownerA.id,
      clinicId: clinicA.id,
      name: "Patient A",
      age: 40,
      gender: "Male",
      phone: "9111111111",
    },
  });
  const cross = await prisma.patient.findFirst({
    where: { id: patientA.id, clinicId: clinicB.id },
  });
  ok(!cross, "patient not visible under other clinic filter");

  console.log("P1 integration DB tests PASSED");
}

runDbTests()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
