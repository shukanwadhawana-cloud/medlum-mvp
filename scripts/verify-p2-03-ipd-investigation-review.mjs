import fs from "node:fs";
import assert from "node:assert/strict";

const page=fs.readFileSync("src/app/ipd/[id]/page.tsx","utf8");
const labs=fs.readFileSync("src/app/api/labs/route.ts","utf8");

for (const x of ["Investigation Results","Mark reviewed",'status:"Reviewed"',"credentials:\"include\"","patientId!==selected.id"])
  assert(page.includes(x),`P2-03 UI regression missing: ${x}`);
assert(page.includes("selected.investigationOrders") || page.includes("selected?.investigationOrders"),"P2-03 UI regression missing: selected.investigationOrders");

for (const x of ['if (status === "Reviewed")',"already clinically reviewed","must have an available result before review","A result is required before clinical review.","existing.status === \"Reviewed\" || existing.status === \"Completed\"","entity: \"LabOrder\""])
  assert(labs.includes(x),`P2-03 API regression missing: ${x}`);

assert(labs.includes("where: { id, patient: { clinicId } }"),"P2-03 must preserve clinic-scoped lab authorization");
assert(!page.includes("Coming Soon"),"P2-03 must not add placeholder UI");
console.log("P2-03 IPD investigation result review verification: PASS");
