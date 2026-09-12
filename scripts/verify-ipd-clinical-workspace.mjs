import fs from "node:fs";

const files = ["src/app/ipd/page.tsx", "src/app/api/ipd/route.ts"];
for (const file of files) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const page = fs.readFileSync(files[0], "utf8");
const api = fs.readFileSync(files[1], "utf8");
for (const text of ["Medication Indent", "Investigation Indent", "Nursing Care Note"]) if (!page.includes(text)) throw new Error(`IPD page missing ${text}`);
for (const text of ["lab-order", "emergency-contact", "clinical-note", "NursingVital"]) if (!api.includes(text)) throw new Error(`IPD API missing ${text}`);
console.log("IPD clinical workspace guard: PASS");
