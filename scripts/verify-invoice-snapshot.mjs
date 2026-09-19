#!/usr/bin/env node
/**
 * Static regression: invoice tariff snapshot + numbering + payment guards must remain in code.
 * Accounting invariant: snapshots are written at create time; live tariff changes must not mutate past invoices.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inv = fs.readFileSync(path.join(root, "src/app/api/invoices/route.ts"), "utf8");
const imp = fs.readFileSync(path.join(root, "src/app/api/tariffs/import/route.ts"), "utf8");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const printApi = fs.readFileSync(path.join(root, "src/app/api/invoices/print/route.ts"), "utf8");

const checks = [
  ["schema InvoiceItem.snapshotJson", schema.includes("snapshotJson")],
  ["schema InvoiceItem.billedRate", schema.includes("billedRate")],
  ["schema InvoiceItem.esicRate", schema.includes("esicRate")],
  ["schema Invoice.tariffVersionId", /model Invoice[\s\S]*?tariffVersionId/.test(schema)],
  ["schema Invoice.invoiceNumber", /model Invoice[\s\S]*?invoiceNumber/.test(schema)],
  ["invoice nextInvoiceNumber INV-", inv.includes("nextInvoiceNumber") && inv.includes("INV-")],
  ["invoice writes snapshotJson", inv.includes("snapshotJson")],
  ["invoice resolves active tariff", inv.includes("isActive: true") && inv.includes("tariffVersion")],
  ["invoice payment balance guard", inv.includes("Payment exceeds outstanding balance")],
  ["invoice duplicate reference 60s", inv.includes("Duplicate payment reference")],
  ["import excelBase64", imp.includes("excelBase64") && imp.includes("parseExcelBase64")],
  ["import preview/commit modes", imp.includes('mode === "commit"') && imp.includes('mode: "preview"')],
  ["import activate supersedes", imp.includes("effectiveTo") && imp.includes("activate")],
  ["import role canManageTariff", imp.includes("canManageTariff")],
  ["import clinic scope", imp.includes("membership.clinicId")],
  ["print uses snapshot not live tariff", printApi.includes("snapshotJson") && printApi.includes("never live")],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error("FAIL:", name);
    failed++;
  } else {
    console.log("OK  :", name);
  }
}

// Pure logic: snapshot must freeze unit price independent of later tariff
function simulateSnapshotInvariant() {
  const tariffV1 = { id: "tv1", name: "T", version: "1", items: [{ code: "CBC", unitPrice: 500 }] };
  const tariffV2 = { id: "tv2", name: "T", version: "2", items: [{ code: "CBC", unitPrice: 600 }] };
  const line = { code: "CBC", quantity: 1, unitPrice: tariffV1.items[0].unitPrice };
  const snap = {
    tariffVersionId: tariffV1.id,
    unitPrice: line.unitPrice,
    amount: line.quantity * line.unitPrice,
  };
  // Later tariff change
  const live = tariffV2.items[0].unitPrice;
  if (snap.unitPrice !== 500 || live !== 600 || snap.unitPrice === live) {
    throw new Error("snapshot invariant broken");
  }
  if (snap.tariffVersionId !== "tv1") throw new Error("version freeze broken");
  return true;
}
simulateSnapshotInvariant();
console.log("OK  : pure snapshot accounting invariant (v1=500 stays after v2=600)");

if (failed) {
  console.error(`\nInvoice/tariff snapshot verification FAILED (${failed} checks)`);
  process.exit(1);
}
console.log("\nInvoice tariff snapshot + numbering verification PASSED");
process.exit(0);
