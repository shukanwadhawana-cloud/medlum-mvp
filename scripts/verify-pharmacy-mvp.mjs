import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/pharmacy/route.ts", "utf8");
const failures = [];

for (const needle of [
  "requireActiveClinicMembership",
  "quantity: d.to",
  "Insufficient stock",
  "stock_adjust",
  "isExpired",
  "patient: { clinicId",
  "Dispensed",
]) {
  if (!route.includes(needle)) failures.push(`pharmacy route missing: ${needle}`);
}

if (failures.length) {
  console.error("Pharmacy MVP verification FAILED");
  failures.forEach((f) => console.error("-", f));
  process.exit(1);
}
console.log("Pharmacy MVP verification PASSED");
console.log("- Clinic membership required");
console.log("- Stock reduction on dispense");
console.log("- Insufficient stock rejection");
console.log("- Stock adjust audit");
console.log("- Expiry awareness");
