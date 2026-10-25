import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = [];
const ok = (condition, message) => condition ? console.log("OK:", message) : (fail.push(message), console.error("FAIL:", message));

const summary = read("src/app/ipd-summaries/page.tsx");
const dischargeUi = read("src/app/ipd/[id]/discharge/page.tsx");
const ipd = read("src/app/api/ipd/route.ts");
const lifecycle = read("src/app/api/patients/lifecycle/route.ts");
const print = read("src/app/api/ipd/print/route.ts");

ok(summary.includes('window.location.assign(`/ipd/${selected.id}/discharge`)'), "Legacy summaries route Discharge Summary into the canonical discharge workflow");
ok(!summary.includes('/api/patients/lifecycle'), "Legacy summaries cannot directly discharge a patient through the old lifecycle route");
ok(!summary.includes('const discharge=async'), "Legacy summaries no longer contain a separate discharge finalization handler");
ok(dischargeUi.includes('action("discharge-summary-draft")'), "Canonical discharge UI saves a draft");
ok(dischargeUi.includes('action("discharge-summary-submit")'), "Canonical discharge UI submits the author draft for signing");
ok(dischargeUi.includes('action("discharge-complete")') && dischargeUi.includes("canVerify") && dischargeUi.includes("canAuthorSign") && dischargeUi.includes("Sign & complete as author"), "Author can sign their own summary; another authorised clinician may also verify");
ok(dischargeUi.includes('n.author?.id===doctor?.id') && dischargeUi.includes('n.author?.id!==doctor?.id'), "The UI distinguishes own and other-authored pending summaries");
ok(ipd.includes("canViewFullClinicalChart(membership.role)"), "Discharge actions require clinical chart permissions");
ok(ipd.includes("canFinalizeClinicalNote(normalizeClinicRole(membership.role))"), "Final discharge signing is limited to authorized verifier roles");
ok(ipd.includes("const isAuthorSigner = note.authorDoctorId === session.doctorId") && ipd.includes('mode: isAuthorSigner ? "AUTHOR_SIGNATURE" : "VERIFIER"') && ipd.includes("buildClinicalSignaturePayload("), "The discharge author may sign their own submitted summary through the canonical payload helper");
ok(ipd.includes('note.contentHash !== hashClinicalNote(note.content, note.version)'), "Submitted discharge content integrity is verified before final signature");
ok(ipd.includes('event: existing ? "DRAFT_SAVED" : "CREATED_DRAFT"') && ipd.includes('event: "SUBMITTED_FOR_VERIFICATION"'), "IPD discharge draft and submitted versions are snapshotted");
ok(ipd.includes("tx.clinicalNoteVersion.create") && ipd.includes('isolationLevel: "Serializable"'), "IPD discharge version snapshots are transactional and race-safe");
ok(ipd.includes('status: "PENDING_VERIFICATION"') && ipd.includes('verifierDoctorId: null') && ipd.includes("verifierDoctorId: isAuthorSigner ? null : session.doctorId"), "Signing is limited to submitted, not-yet-signed summaries and preserves signer identity");
ok(ipd.includes("prisma.$transaction(async (tx) =>") && ipd.includes("tx.clinicalNote.updateMany") && ipd.includes("tx.patient.updateMany"), "Final note signature and patient discharge happen atomically");
ok(ipd.includes("patient acknowledgement must be recorded"), "Server enforces patient acknowledgement before submit and final discharge");
ok(print.includes('status: "FINAL"') && print.includes("not yet finalized"), "IPD print endpoint rejects non-final summaries");

ok(lifecycle.includes("USE_IPD_DISCHARGE_WORKFLOW"), "Legacy lifecycle API explicitly blocks direct patient discharge");
ok(!/action === "discharge"[\s\S]{0,1000}data: \{ status: "DISCHARGED" \}/.test(lifecycle), "Legacy lifecycle API cannot mark patients discharged directly");
ok(lifecycle.includes('["soft-delete", "restore"]'), "Lifecycle endpoint remains available for scoped retention management");

if (fail.length) {
  console.error("\nP2-01 discharge workflow verification FAILED:\n" + fail.map((x) => " - " + x).join("\n"));
  process.exit(1);
}
console.log("\nP2-01 IPD discharge signing workflow verification PASSED");
