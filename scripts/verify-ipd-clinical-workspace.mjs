import fs from "node:fs";
const api=fs.readFileSync("src/app/api/ipd/route.ts","utf8");
for(const text of ["clinicId,doctorId","lab-order","emergency-contact","clinical-note","NursingVital"])if(!api.includes(text))throw new Error(`IPD API guard missing ${text}`);
console.log("IPD API clinical workflow guard: PASS");
