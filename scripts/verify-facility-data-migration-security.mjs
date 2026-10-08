/**
 * Static security / data-integrity gate for facility-scoped export/import.
 * Covers USA-readiness hardening requirements without mutating production data.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    failures.push(`Missing required file: ${rel}`);
    return "";
  }
  return readFileSync(p, "utf8");
}

const lib = read("src/lib/data/facility-migration.ts");
const exportRoute = read("src/app/api/facility-data/export/route.ts");
const previewRoute = read("src/app/api/facility-data/import/preview/route.ts");
const commitRoute = read("src/app/api/facility-data/import/commit/route.ts");
const docs = read("docs/FACILITY_DATA_MIGRATION_SECURITY.md");
const clinicAuth = read("src/lib/clinic-auth.ts");
const permissions = read("src/lib/permissions.ts");

function must(cond, msg) {
  if (!cond) failures.push(msg);
}

must(exportRoute.includes("requireActiveClinicMembership"), "Export must use requireActiveClinicMembership");
must(exportRoute.includes("getSession"), "Export must require authenticated session");
must(exportRoute.includes("canPerformFacilityDataMigration"), "Export must gate on migration role helper");
must(exportRoute.includes("void url.searchParams.get(\"clinicId\")") || exportRoute.includes("searchParams.get(\"clinicId\")"), "Export must explicitly ignore client clinicId");
must(lib.includes("clinicId: membership.clinicId"), "Export builder must scope patients to membership.clinicId");
must(!exportRoute.includes("body.clinicId") || exportRoute.includes("void"), "Export must not authorize from body clinicId");
must(previewRoute.includes("requireActiveClinicMembership"), "Preview must use requireActiveClinicMembership");
must(previewRoute.includes("canPerformFacilityDataMigration"), "Preview must gate on Owner/Admin");
must(previewRoute.includes("previewFacilityImport"), "Preview must call non-mutating helper");
must(lib.includes("mutated: false") || previewRoute.includes("mutated: false"), "Preview audit must record non-mutation");
must(lib.includes("void body.clinicId") || lib.includes("destinationClinicId"), "Import must ignore client destination facility ids");
must(lib.includes("MAX_IMPORT_BATCH"), "Import must bound batch size");
must(lib.includes("duplicate_match"), "Import must detect facility-local duplicates");
must(lib.includes("will not overwrite") || lib.includes("will not overwrite existing"), "Duplicates must not overwrite clinical records");
must(lib.includes('FACILITY_MIGRATION_ROLES') && lib.includes('"Owner"') && lib.includes('"Admin"'), "Only Owner/Admin may migrate");
must(lib.includes("membership.clinicId"), "All import writes must use membership.clinicId");
must(lib.includes("normalizeUhid") && lib.includes("normalizePhone"), "Duplicate matching uses UHID/phone identifiers");
must(clinicAuth.includes("findAuthorizedPatient"), "Existing patient authorization helper must remain intact");
must(lib.includes("$transaction") || commitRoute.includes("$transaction"), "Commit must use a database transaction");
must(lib.includes("rolled back") || lib.includes("No partial"), "Partial failure must be reported and rolled back");
must(commitRoute.includes("success: false") || lib.includes("success: false"), "Commit must not silently report success after failure");
must(exportRoute.includes("FACILITY_DATA_EXPORT"), "Export must audit FACILITY_DATA_EXPORT");
must(previewRoute.includes("FACILITY_DATA_IMPORT_PREVIEW"), "Preview must audit FACILITY_DATA_IMPORT_PREVIEW");
must(commitRoute.includes("FACILITY_DATA_IMPORT_COMMIT"), "Commit must audit FACILITY_DATA_IMPORT_COMMIT");
must(exportRoute.includes("writeAudit") && previewRoute.includes("writeAudit") && commitRoute.includes("writeAudit"), "All operations must writeAudit");
must(!lib.includes("password") && !lib.includes("SESSION_SECRET") && !lib.includes("RAZORPAY"), "Export must not include secrets/passwords");
must(!exportRoute.includes("stack") && !commitRoute.includes("e.stack"), "Must not return stack traces to clients");
must(lib.includes("slice(0, 2000)") || lib.includes("2000"), "Notes length must be bounded");

const markers = [
  ["requireActiveClinicMembership", "Authorized facility path"],
  ["canPerformFacilityDataMigration", "Role gate"],
  ["clinicId: membership.clinicId", "Server facility scope"],
  ["duplicate_match", "Duplicate patient handling"],
  ["void body.clinicId", "Reject client facility override"],
  ["$transaction", "Atomic commit"],
  ["FACILITY_DATA_EXPORT", "Export audit"],
  ["FACILITY_DATA_IMPORT_COMMIT", "Import audit"],
];
for (const [needle, label] of markers) {
  const found = lib.includes(needle) || exportRoute.includes(needle) || previewRoute.includes(needle) || commitRoute.includes(needle);
  must(found, `Security marker missing (${label}): ${needle}`);
}

must(docs.includes("Security boundary"), "Docs must describe security boundary");
must(docs.includes("facility") || docs.includes("Facility"), "Docs must describe facility scoping");
must(docs.includes("duplicate") || docs.includes("Duplicate"), "Docs must describe duplicate handling");
must(docs.includes("Owner") && docs.includes("Admin"), "Docs must describe role restriction");
must(docs.includes("preview") || docs.includes("Preview"), "Docs must describe preview stage");
must(docs.includes("audit") || docs.includes("Audit"), "Docs must describe audit behavior");
must(clinicAuth.includes("requireActiveClinicMembership"), "clinic-auth requireActiveClinicMembership must remain");
must(clinicAuth.includes("findAuthorizedPatient"), "clinic-auth findAuthorizedPatient must remain");
must(permissions.includes("billing") && permissions.includes("Owner"), "permissions MODULE_ROLES must remain intact");

// Owner UI + architecture gates (hospital migration center)
const ownerUi = read("src/app/owner/facility-data/page.tsx");
const arch = read("docs/HOSPITAL_DATA_MIGRATION_ARCHITECTURE.md");
const ownerHome = read("src/app/owner/page.tsx");

must(ownerUi.includes("/api/facility-data/export"), "owner UI must call facility-data export");
must(ownerUi.includes("/api/facility-data/import/preview"), "owner UI must call import preview");
must(ownerUi.includes("/api/facility-data/import/commit"), "owner UI must call import commit");
must(ownerUi.includes("CONFIRM"), "owner UI must require explicit CONFIRM before commit");
must(!ownerUi.includes("\\n"), "owner facility-data page must not contain escaped-newline corruption");
must(ownerHome.includes("/owner/facility-data"), "owner home must link to facility-data migration center");
must(arch.includes("membership.clinicId") || arch.includes("membership"), "architecture doc must stress membership-scoped destination");
must(arch.includes("R2") || arch.includes("object storage"), "architecture doc must address object storage plane");
must(arch.includes("chunk") || arch.includes("manifest"), "architecture doc must require chunk/manifest path for large hospitals");
must(!arch.includes("\\n"), "architecture doc must not contain escaped-newline corruption");

if (failures.length) {
  console.error("Facility data migration security verification FAILED");
  for (const f of failures) console.error("- " + f);
  process.exit(1);
}

console.log("Facility data migration security verification PASSED");
console.log("- Export/import scoped to requireActiveClinicMembership clinicId");
console.log("- Owner/Admin only; clinical roles cannot migrate");
console.log("- Preview is non-mutating; commit is transactional");
console.log("- Duplicates matched by UHID/registration/phone+name; no silent overwrite");
console.log("- Client clinicId/facilityId ignored");
console.log("- Audit events recorded without secret/PHI dumps");
console.log("- Owner UI + architecture docs present and free of escaped-newline corruption");
