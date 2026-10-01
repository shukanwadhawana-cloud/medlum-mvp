/**
 * Static regression checks for IPD discharge → summary → retention → billing.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
function assert(c, m) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
  console.log("OK:", m);
}

const ipd = read("src/app/api/ipd/route.ts");
assert(ipd.includes("discharge-summary-draft"), "IPD supports discharge-summary-draft");
assert(ipd.includes("discharge-summary-submit"), "IPD supports discharge-summary-submit");
assert(ipd.includes("discharge-complete"), "IPD supports discharge-complete");
assert(ipd.includes('error: "Unknown action"'), "Unknown action still guarded for unsupported actions");
assert(ipd.includes("DISCHARGE_SUMMARY_DRAFT") || ipd.includes("discharge-summary-draft"), "draft audit path");

const page = read("src/app/ipd/[id]/discharge/page.tsx");
assert(page.includes("Save Draft"), "UI Save Draft");
assert(page.includes("discharge-summary-draft"), "UI calls draft action");
assert(page.includes("discharge-complete"), "UI calls discharge-complete");
assert(!page.includes('action: "clinical-note"'), "UI no longer uses clinical-note-only path for discharge");
assert(page.includes("Billing clearance is separate") || page.includes("billing clearance"), "billing separate messaging");

const print = read("src/app/api/ipd/print/route.ts");
assert(print.includes("not yet finalized"), "print rejects non-final summaries");
assert(print.includes('status: "FINAL"') || print.includes('status === "FINAL"') || print.includes('n.status === "FINAL"'), "print prefers FINAL ClinicalNote");

const invoices = read("src/app/api/invoices/route.ts");
assert(invoices.includes("dischargedBillingPending"), "billing API groups discharged pending");
assert(invoices.includes("BILLING_PENDING"), "billing status derived");

const lifecycle = read("src/app/api/patients/lifecycle/route.ts");
assert(lifecycle.includes('action: "discharge"'), "lifecycle discharge exists");
assert(!/deletedAt:\s*new Date\(\)/.test(lifecycle.split("if (action === \"discharge\")")[1]?.split("if (action === \"soft-delete\")")[0] || ""), "discharge does not soft-delete");

console.log("\nIPD discharge lifecycle checks passed.");
