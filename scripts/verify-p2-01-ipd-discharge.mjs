import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = [];
const ok = (condition, message) => condition ? console.log("OK:", message) : (fail.push(message), console.error("FAIL:", message));

const ipd = read("src/app/api/ipd/route.ts");
const workspace = read("src/app/ipd/[id]/page.tsx");
const lifecycle = read("src/app/api/patients/lifecycle/route.ts");

// --- Architecture: draft → submit → discharge-complete preserved ---
ok(ipd.includes('action === "discharge-summary-draft"'), "draft path preserved");
ok(ipd.includes('action === "discharge-summary-submit"'), "submit path preserved");
ok(ipd.includes('action === "discharge-complete"') || ipd.includes('"discharge-complete"'), "discharge-complete path preserved");

// --- Atomic final discharge ---
ok(ipd.includes("$transaction"), "discharge-complete uses Prisma $transaction");
ok(/\$transaction\s*\(\s*async\s*\(\s*tx\s*\)/.test(ipd), "transaction callback uses tx client");
ok(ipd.includes('status: "FINAL"') && ipd.includes('status: "DISCHARGED"'), "FINAL note and DISCHARGED patient both present");
// both updates must live inside the same transaction block (tx.clinicalNote + tx.patient)
const txStart = ipd.indexOf("prisma.$transaction");
const txSlice = ipd.slice(txStart, txStart + 1200);
ok(txSlice.includes("tx.clinicalNote.update") || txSlice.includes("tx.clinicalNote"), "ClinicalNote FINAL update is inside the transaction");
ok(txSlice.includes("tx.patient.update") || txSlice.includes("tx.patient"), "Patient DISCHARGED update is inside the transaction");
ok(!/await prisma\.clinicalNote\.update[\s\S]{0,400}await prisma\.patient\.update/.test(ipd.slice(ipd.indexOf("discharge-complete") > 0 ? 0 : 0)), "no sequential non-transactional note+patient updates after complete path");

// Reject already discharged (pre-check + in-tx check)
ok(ipd.includes('Patient is already discharged'), "already-discharged rejection message present");
ok(ipd.includes("ALREADY_DISCHARGED") || /status === "DISCHARGED"/.test(txSlice), "in-transaction status re-check for concurrency");

// Require content
ok(ipd.includes("Discharge summary content required"), "missing content rejected");

// Census / history
ok(
  /parseCareSetting\(p\.notes\)\s*===\s*"IPD"\s*&&\s*p\.status\s*===\s*"ACTIVE"/.test(ipd),
  "IPD census limited to active IPD patients"
);
ok(
  ipd.includes("ipdHistory") && /parseCareSetting\(p\.notes\)\s*===\s*"IPD"\s*&&\s*p\.status\s*!==\s*"ACTIVE"/.test(ipd),
  "Discharged IPD patients remain available via ipdHistory"
);

// UI uses discharge-complete (not a separate lifecycle discharge for clinical finalize)
ok(workspace.includes('action:"discharge-complete"') || workspace.includes('action: "discharge-complete"') || workspace.includes('"discharge-complete"'), "IPD workspace finalizes via discharge-complete");
ok(workspace.includes("window.confirm("), "Final discharge requires explicit confirmation");

// Lifecycle still rejects already discharged (billing/clinical separation preserved)
ok(lifecycle.includes('patient.status === "DISCHARGED"') || lifecycle.includes('status === "DISCHARGED"'), "Lifecycle rejects already discharged patient");
ok(lifecycle.includes("status: 409") || lifecycle.includes("409"), "Already-discharged returns conflict");

// Draft/submit still independent of final transaction
const draftIdx = ipd.indexOf("discharge-summary-draft");
const submitIdx = ipd.indexOf("discharge-summary-submit");
const completeIdx = ipd.indexOf("$transaction");
ok(draftIdx > 0 && draftIdx < completeIdx, "draft path exists before complete transaction");
ok(submitIdx > 0 && submitIdx < completeIdx, "submit path exists before complete transaction");

if (fail.length) {
  console.error("\nP2-01 regression verification FAILED:\n" + fail.map(x => " - " + x).join("\n"));
  process.exit(1);
}
console.log("\nP2-01 regression verification PASSED");
