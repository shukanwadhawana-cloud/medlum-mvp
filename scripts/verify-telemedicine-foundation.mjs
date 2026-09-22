import { readFile } from "node:fs/promises";

const schema = await readFile("prisma/schema.prisma", "utf8");
const migration = await readFile("prisma/migrations/20260912183000_add_telemedicine_foundation/migration.sql", "utf8");

/** Collapse runs of whitespace so Prisma-formatted alignment does not break checks. */
function hasSchema(fragment) {
  const norm = (s) => s.replace(/\s+/g, " ");
  return norm(schema).includes(norm(fragment));
}

const requiredSchema = [
  "model TelemedicineSession",
  "doctorId String",
  "patientId String",
  "scheduledAt DateTime",
  'status String @default("Scheduled")',
  'provider String @default("external")',
  "joinTokenHash String? @unique",
];
const requiredMigration = [
  'CREATE TABLE "TelemedicineSession"',
  '"joinTokenHash" TEXT',
  '"TelemedicineSession_joinTokenHash_key"',
  "ON DELETE RESTRICT",
  '"TelemedicineSession_doctorId_scheduledAt_idx"',
  '"TelemedicineSession_patientId_scheduledAt_idx"',
];

const failures = [];
for (const item of requiredSchema) if (!hasSchema(item)) failures.push(`schema missing: ${item}`);
for (const item of requiredMigration) if (!migration.includes(item)) failures.push(`migration missing: ${item}`);

const routes = [
  "src/app/api/telemedicine/sessions/route.ts",
  "src/app/api/telemedicine/sessions/[id]/route.ts",
  "src/app/api/telemedicine/join/route.ts",
  "src/app/api/portal/telemedicine/sessions/route.ts",
];
for (const route of routes) {
  try { await readFile(route, "utf8"); }
  catch { failures.push(`route missing: ${route}`); }
}

const doctorRoute = await readFile(routes[0], "utf8");
const lifecycleRoute = await readFile(routes[1], "utf8");
const joinRoute = await readFile(routes[2], "utf8");
const portalRoute = await readFile(routes[3], "utf8");
if (!/getSession\s*\(/.test(doctorRoute)) failures.push("doctor session route is not session-authenticated");
if (!/doctorId:\s*session\.doctorId/.test(doctorRoute)) failures.push("doctor session creation is not scoped to authenticated doctor");
if (!/where:\s*\{\s*id, doctorId:\s*session\.doctorId/.test(lifecycleRoute)) failures.push("session lifecycle route is not doctor-scoped");
if (!/hashJoinToken\(token\)/.test(joinRoute)) failures.push("join route does not hash bearer token");
if (!/getPortalSession\s*\(/.test(portalRoute)) failures.push("patient portal session list is not portal-authenticated");
if (!/patientId:\s*session\.patientId/.test(portalRoute)) failures.push("patient portal session list is not patient-scoped");

if (failures.length) {
  console.error("MedLum telemedicine foundation verification FAILED");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("MedLum telemedicine foundation verification PASSED");
