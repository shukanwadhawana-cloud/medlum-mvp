import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = [];
const ok = (condition, message) => condition ? console.log("OK:", message) : (fail.push(message), console.error("FAIL:", message));

const summary = read("src/app/ipd-summaries/page.tsx");
const ipd = read("src/app/api/ipd/route.ts");
const lifecycle = read("src/app/api/patients/lifecycle/route.ts");

ok(summary.includes('fetch("/api/ipd"') && summary.includes('action:"clinical-note"'), "Discharge Summary is still saved through the existing IPD documentation API");
ok(summary.includes('fetch("/api/patients/lifecycle"'), "Discharge action reuses the existing patient lifecycle API");
ok(summary.includes('action:"discharge"'), "Discharge action sends the existing discharge operation");
ok(summary.includes('window.confirm('), "Final discharge requires explicit confirmation");
ok(summary.includes('type==="Discharge Summary"'), "Final discharge control is exposed only for Discharge Summary");
ok(summary.includes('disabled={saving||discharging}'), "Save/discharge controls prevent concurrent double submission");
const saveSection = summary.slice(summary.indexOf("const save="), summary.indexOf("const discharge="));
ok(!saveSection.includes('fetch("/api/patients/lifecycle"'), "Saving a summary does not silently call the discharge lifecycle");
ok(summary.includes('setSelected(null)') && summary.includes('await load()'), "Successful discharge clears the selected active patient and refreshes IPD state");

ok(ipd.includes('parseCareSetting(p.notes)==="IPD"&&p.status==="ACTIVE"'), "IPD census is limited to active IPD patients");
ok(lifecycle.includes('patient.status === "DISCHARGED"'), "Lifecycle endpoint rejects an already discharged patient");
ok(lifecycle.includes('status: 409'), "Already-discharged transition returns a conflict");

if (fail.length) {
  console.error("\nP2-01 regression verification FAILED:\n" + fail.map(x => " - " + x).join("\n"));
  process.exit(1);
}
console.log("\nP2-01 regression verification PASSED");
