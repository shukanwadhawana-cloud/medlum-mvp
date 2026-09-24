import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = [];
const ok = (condition, message) => condition ? console.log("OK:", message) : (fail.push(message), console.error("FAIL:", message));

const ipd = read("src/app/ipd/[id]/page.tsx");

ok(ipd.includes('d.success!==true'), "IPD POST treats only an explicit success:true response as a successful save");
ok(ipd.includes('!r.ok||d.success!==true'), "HTTP/API save failures enter the error path");
ok(ipd.includes('setMsg("");setError(e.message||"Could not save IPD record")'), "A failed save clears any green success message and shows the actual error");
ok(ipd.includes('try{await load()}catch(e:any){setError(e.message||"Saved, but the IPD workspace could not be refreshed.'), "A successful save is not reported as a failed save when the post-save refresh fails");
ok(ipd.includes('role="alert" aria-live="assertive"'), "Save failures are exposed as an accessible alert");
ok(ipd.includes('role="status" aria-live="polite"'), "Successful saves are exposed as an accessible status");
ok(ipd.includes('if(!(await run({action:"clinical-note"'), "Clinical-note save uses the shared failure-safe save handler");
ok(ipd.includes('if(!(await run({action:"lab-order"'), "Investigation save uses the shared failure-safe save handler");
ok(ipd.includes('if(!(await run({action:"vitals"'), "Nursing-round save uses the shared failure-safe save handler");
ok(ipd.includes('if(!(await run({action:"register"'), "IPD registration uses the shared failure-safe save handler");

if (fail.length) {
  console.error("\nIPD failed-save handling verification FAILED:\n" + fail.map(x => " - " + x).join("\n"));
  process.exit(1);
}
console.log("\nIPD failed-save handling verification PASSED");
