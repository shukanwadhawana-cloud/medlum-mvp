#!/usr/bin/env node
/**
 * P1 closure static verification — code-side only (no live DB/R2).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(msg);
  else console.log("OK:", msg);
}

// Schema
const schema = read("prisma/schema.prisma");
ok(schema.length > 20000, "schema size > 20KB");
ok((schema.match(/^model /gm) || []).length >= 36, ">= 36 models");
ok(!/PLACEHOLDER|TODO_RESTORE|TRUNCATED/.test(schema), "no schema placeholders");
ok(schema.includes("staffCode"), "staffCode in schema");
ok(schema.includes("letterheadHeightMm"), "letterheadHeightMm in schema");
ok(schema.includes("showMedlumFooter"), "showMedlumFooter in schema");

// Staff ID
const staffId = read("src/lib/staff-id.ts");
ok(staffId.includes("allocateStaffCode"), "allocateStaffCode");
ok(staffId.includes("staffIdPrefix"), "staffIdPrefix");
ok(staffId.includes("DOC") && staffId.includes("LAB"), "DOC/LAB prefixes");
ok(staffId.includes("padStart(4"), "zero-padded sequence");

// Staff API does not reallocate on role change
const clinicApi = read("src/app/api/clinic/route.ts");
ok(clinicApi.includes("staffCode"), "clinic API exposes staffCode");
ok(clinicApi.includes("Staff ID is permanent") || clinicApi.includes("staffCode: target.staffCode"), "role change preserves staffCode");

// IST
const time = read("src/lib/time.ts");
ok(time.includes("Asia/Kolkata"), "IST timezone");
ok(time.includes("formatIst"), "formatIst helper");

// Lab queue
const labs = read("src/app/labs/page.tsx");
ok(labs.includes("ACTIVE_STATUSES"), "active statuses set");
ok(labs.includes("HISTORY_STATUSES"), "history statuses set");
ok(labs.includes("Encounter not linked") || labs.includes("resolveEncounterType"), "neutral encounter label");
ok(labs.includes("groupByPatient"), "patient grouping");
ok(labs.includes("encounterId || \"none\"") || labs.includes("`${o.patientId"), "group key includes encounter");

// Print layout
ok(existsSync(join(root, "src/lib/print-layout.ts")), "print-layout helper");
const printLayout = read("src/lib/print-layout.ts");
ok(printLayout.includes("letterheadHeightMm"), "letterhead helper");
ok(printLayout.includes("showMedlumFooter"), "footer helper");
ok(printLayout.includes("Powered by MedLum") === false, "print-layout does not force top branding");

// Clinical print APIs (no financial fields in clinical docs)
const rxPrint = read("src/app/api/prescriptions/print/route.ts");
ok(rxPrint.includes("PRESCRIPTION"), "prescription print type");
ok(!rxPrint.includes("invoice total") && !rxPrint.includes("balance"), "rx print no balance field");
const labPrint = read("src/app/api/labs/print/route.ts");
ok(labPrint.includes("LAB_REPORT"), "lab report print type");
ok(!labPrint.includes("paid"), "lab print no paid field");

// Invoice print still has financial (correct)
const invPrint = read("src/app/api/invoices/print/route.ts");
ok(invPrint.includes("letterheadHeightMm"), "invoice letterhead");
ok(invPrint.includes("balance"), "invoice retains balance");

// Upload UX
const upload = read("src/components/LabResultDocumentPanel.tsx");
ok(upload.includes("uploading") || upload.includes("UploadPhase"), "upload phase machine");
ok(upload.includes("Retry") || upload.includes("failed"), "upload failure/retry");

// Document view tenant scope
const view = read("src/app/api/labs/documents/[id]/view/route.ts");
ok(view.includes("requireActiveClinicMembership"), "view requires membership");
ok(view.includes("clinicId"), "view tenant scoped");

// Anti-spoof: clinical mutations use session, not body staffCode
const prescriptions = read("src/app/api/prescriptions/route.ts");
ok(prescriptions.includes("session.doctorId"), "prescription uses session doctorId");
ok(!prescriptions.includes("body.staffCode"), "prescription does not trust body.staffCode");
const labsApi = read("src/app/api/labs/route.ts");
ok(labsApi.includes("session.doctorId") || labsApi.includes("getSession"), "labs uses session");

// Storage fail-closed
const storage = read("src/lib/storage/index.ts");
ok(storage.includes("STORAGE_PROVIDER"), "storage provider env");
ok(storage.includes("isServerlessRuntime") || storage.includes("VERCEL"), "serverless guard");
ok(storage.includes("not available on production"), "production fail-closed message");

if (fails.length) {
  console.error("FAIL:\n" + fails.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log("P1 closure static verification PASSED");
