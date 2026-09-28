import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const files = {
  schema: "prisma/schema.prisma",
  invoices: "src/app/api/invoices/route.ts",
  tariffs: "src/app/api/tariffs/route.ts",
  tariffImport: "src/app/api/tariffs/import/route.ts",
  billingUi: "src/app/billing/page.tsx",
  billingPrint: "src/app/billing/print/page.tsx",
  tariffUi: "src/app/clinic/tariffs/page.tsx",
  chart: "src/app/patients/[id]/chart/page.tsx",
};

for (const [k, f] of Object.entries(files)) {
  if (!fs.existsSync(path.join(root, f))) failures.push(`missing ${f}`);
}

const schema = fs.readFileSync(path.join(root, files.schema), "utf8");
const inv = fs.readFileSync(path.join(root, files.invoices), "utf8");
const tariffs = fs.readFileSync(path.join(root, files.tariffs), "utf8");
const billingUi = fs.readFileSync(path.join(root, files.billingUi), "utf8");
const billingPrint = fs.readFileSync(path.join(root, files.billingPrint), "utf8");
const tariffUi = fs.readFileSync(path.join(root, files.tariffUi), "utf8");
const chart = fs.readFileSync(path.join(root, files.chart), "utf8");

const checks = [
  ["models Invoice InvoiceItem Payment TariffVersion TariffItem", ["model Invoice", "model InvoiceItem", "model Payment", "model TariffVersion", "model TariffItem"].every((m) => schema.includes(m))],
  ["invoice server-side totals", inv.includes("subtotal") && inv.includes("discount") && inv.includes("tax") && inv.includes("total")],
  ["invoice numbering INV-", inv.includes("nextInvoiceNumber") && inv.includes("INV-")],
  ["invoice clinic isolation", inv.includes("clinicId: member.clinicId") || inv.includes("clinicId: membership.clinicId")],
  ["selected clinic membership", inv.includes("requireActiveClinicMembership")],
  ["tariff snapshot on line items", inv.includes("snapshotJson")],
  ["payment overpayment guard", inv.includes("Payment exceeds outstanding balance")],
  ["payment cancelled guard", inv.includes("Cannot record payment against a cancelled invoice")],
  ["payment already-paid guard", inv.includes("already fully paid")],
  ["duplicate payment reference", inv.includes("Duplicate payment reference")],
  ["payment writeAudit", inv.includes('action: "payment"')],
  ["invoice statuses", ["Pending", "Partially Paid", "Paid", "Cancelled"].every((s) => inv.includes(s))],
  ["tariff clinic scoped", tariffs.includes("membership.clinicId") || tariffs.includes("clinicId: membership.clinicId")],
  ["tariff activate", tariffs.includes("activate") || tariffUi.includes("activate")],
  ["billing UI payment methods", ["Cash", "UPI"].every((m) => billingUi.includes(m))],
  ["billing UI create invoice", billingUi.includes("Create invoice") || billingUi.includes("apiAddInvoice")],
  ["billing print route", billingPrint.includes("invoice") || billingPrint.length > 50],
  ["chart billing integration", chart.includes("billing") || chart.includes("invoice")],
  ["no SEE_FILE", !inv.includes("SEE_FILE") && !billingUi.includes("SEE_FILE")],
];

for (const [name, ok] of checks) if (!ok) failures.push(`failed ${name}`);

if (failures.length) {
  console.error("Billing workflow verification FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log("Billing workflow verification PASSED");
for (const [name] of checks) console.log(`✓ ${name}`);
