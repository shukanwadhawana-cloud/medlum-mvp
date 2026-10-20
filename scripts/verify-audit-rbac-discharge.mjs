import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const invoice = read("../src/app/api/invoices/print/route.ts");
const pharmacy = read("../src/app/api/pharmacy/route.ts");
const ipd = read("../src/app/api/ipd/route.ts");
const ipdPrint = read("../src/app/api/ipd/print/route.ts");
const rxPrint = read("../src/app/api/prescriptions/print/route.ts");
const labPrint = read("../src/app/api/labs/print/route.ts");
const docker = read("../Dockerfile");
const renderStart = read("./render-start.sh");

assert.match(invoice, /canViewBillingDetail\(membership\.role\)/, "invoice printing must enforce billing roles");
assert.ok((pharmacy.match(/canManagePharmacy\(membership\.role\)/g) || []).length >= 4, "pharmacy endpoints must enforce pharmacy roles");
assert.match(ipd, /canFinalizeClinicalNote\(actor\.normalizedRole\)/, "discharge finalisation must enforce signing role");
assert.match(ipd, /SECOND_SIGNER_REQUIRED/, "discharge author cannot be their own second verifier");
assert.match(ipd, /CONTENT_HASH_MISMATCH/, "discharge content integrity must be checked before signing");
assert.match(ipd, /status: "PENDING_VERIFICATION"/, "only submitted notes may be finalised");
assert.match(ipd, /verifierDoctorId: null/, "finalisation must be a compare-and-set transition");
assert.match(ipdPrint, /canViewClinicalChart\(membership\.role\)/, "discharge print must enforce clinical chart role");
assert.match(rxPrint, /canViewClinicalChart\(membership\.role\)/, "prescription print must enforce clinical chart role");
assert.match(labPrint, /canViewClinicalChart\(membership\.role\).*canManageLab\(membership\.role\)/s, "lab print must enforce clinical or laboratory role");
assert.match(docker, /CMD \["sh", "\.\/scripts\/render-start\.sh"\]/, "Docker must use a correctly quoted startup script");
assert.match(renderStart, /npx prisma migrate deploy/, "startup script must preserve existing migration behavior");
assert.match(renderStart, /exec npm start/, "startup script must start the web process after migration");
console.log("Audit RBAC/discharge/Render startup regression checks passed.");
