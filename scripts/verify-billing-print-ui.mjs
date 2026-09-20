#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const billing = fs.readFileSync(path.join(root, "src/app/billing/page.tsx"), "utf8");
const printPage = fs.readFileSync(path.join(root, "src/app/billing/print/page.tsx"), "utf8");
const checks = [
  ["Billing has Print invoice action", billing.includes("Print invoice")],
  ["Billing has Print receipt when paid", billing.includes("Print receipt") && billing.includes("inv.paid>0")],
  ["Print uses /billing/print?id=", billing.includes("/billing/print?id=")],
  ["Print page reads query id", printPage.includes('sp.get("id")')],
  ["Print page calls invoices/print API", printPage.includes("/api/invoices/print?id=")],
  ["Payment modal has Print link", billing.includes("payFor.id") && billing.includes("billing/print")],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS:" : "FAIL:", name);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log("Billing print UI verification PASSED");
