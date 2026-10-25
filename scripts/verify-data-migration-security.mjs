import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync("src/lib/data-migration.ts", "utf8");
const importRoute = readFileSync("src/app/api/owner/data-migration/import/route.ts", "utf8");
const exportRoute = readFileSync("src/app/api/owner/data-migration/export/route.ts", "utf8");
const page = readFileSync("src/app/owner/data-migration/page.tsx", "utf8");

assert.match(service, /MIGRATION_SCHEMA_VERSION = 2/);
assert.match(service, /ClinicalNoteVersion/);
assert.match(service, /content hash does not match its content/);
assert.match(service, /prisma\.patient\.findMany\(\{ where: \{ clinicId \} \}\)/);
assert.doesNotMatch(service, /where: \{ OR: \[\{ clinicId \}, \{ doctorId:/);
assert.match(service, /table: "Appointment", where: c => anyOf\("patientId", c\.patientIds\)/);
assert.match(service, /table: "ClinicalNote", where: c => \(\{ sql: `"clinicId" = \$1`/);
assert.doesNotMatch(service, /table: "AuditLog"/);
assert.doesNotMatch(service, /table: "FacilityTelegramIntegration"/);
assert.doesNotMatch(service, /table: "TelegramIdentity"/);
assert.match(service, /notMigrated: \[/);
assert.match(service, /joinTokenHash/);
assert.match(service, /meetingUrl/);
assert.match(service, /sourceIdsByTable/);
assert.match(service, /references a missing source/);
assert.match(service, /TariffItem: \{ tariffVersionId: "TariffVersion" \}/);
assert.match(service, /tx\.auditLog\.create/);
assert.match(service, /sensitiveKeys/);
assert.match(service, /duplicate id/);

assert.match(importRoute, /const maxBytes = 20 \* 1024 \* 1024/);
assert.match(importRoute, /await req\.text\(\)/);
assert.match(importRoute, /status: 413/);
assert.doesNotMatch(importRoute, /prisma\.auditLog\.create/);
assert.match(exportRoute, /isMedlumOwnerEmail\(session\.email\)/);
assert.match(exportRoute, /Cache-Control.*no-store/);
assert.match(exportRoute, /const maxBytes = 20 \* 1024 \* 1024/);
assert.match(exportRoute, /status: 413/);
assert.match(page, /Validated record counts/);
assert.match(page, /deferredTables/);

console.log("Facility data migration security guardrails verified.");
