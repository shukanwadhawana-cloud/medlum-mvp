import fs from "node:fs";
import assert from "node:assert/strict";

const page=fs.readFileSync("src/app/ipd/[id]/page.tsx","utf8");
const labs=fs.readFileSync("src/app/api/labs/route.ts","utf8");

for (const x of [
  'mainTab==="Orders"',
  'leftNav==="Laboratory"',
  "EXPANDED_LAB_CATALOG",
  "labSearch",
  "Place lab order",
  "selectedLabs",
  "Mark reviewed"
]) assert(page.includes(x),`P2-03 IPD investigation workflow missing: ${x}`);

assert(!page.includes('mainTab==="Lab"'),"P2-03 must not expose a separate top-level Lab workspace");
assert(!page.includes("Investigation Results"),"P2-03 must not expose a separate Investigation Results workspace");
assert(page.includes('status:"Reviewed"'),"P2-03 review action must remain available from the integrated workflow");
assert(page.includes('patientId!==selected.id'),"P2-03 must preserve patient scoping in client-side investigation handling");

for (const x of ['if (status === "Reviewed")',"already clinically reviewed","must have an available result before review","A result is required before clinical review.","existing.status === \"Reviewed\" || existing.status === \"Completed\"","entity: \"LabOrder\""])
  assert(labs.includes(x),`P2-03 API regression missing: ${x}`);

assert(labs.includes("where: { id, patient: { clinicId } }"),"P2-03 must preserve clinic-scoped lab authorization");
assert(!page.includes("Coming Soon"),"P2-03 must not add placeholder UI");
console.log("P2-03 IPD integrated investigation workflow verification: PASS");
