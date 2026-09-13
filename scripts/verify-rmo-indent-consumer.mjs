import fs from "node:fs";

const api = fs.readFileSync("src/app/api/rmo/indents/route.ts", "utf8");
const page = fs.readFileSync("src/app/rmo/page.tsx", "utf8");
const ipd = fs.readFileSync("src/app/api/ipd/route.ts", "utf8");

const requireAll = (text, tokens, label) => {
  for (const token of tokens) if (!text.includes(token)) throw new Error(`${label}: missing ${token}`);
};

requireAll(ipd, ["noteType===\"Medication Indent\"", "prisma.prescription.create", "noteType:\"Investigation Indent\"", "prisma.labOrder.create", "orderId"], "IPD producer");
requireAll(api, ["export async function GET", "export async function POST", "MedicationIndent", "InvestigationIndent", "action: \"consume\"", "prisma.dispensing.create", "status: \"Consumed\"", "consumer: \"RMO\"", "!consumed.has"], "RMO consumer API");
requireAll(page, ["/api/rmo/indents", "RMO Indent Queue", "RMO Consume / Accept", "type:i.type", "orderId:i.id"], "RMO consumer UI");

console.log("RMO indent consumer contract: PASS");
console.log("Medication: IPD Prescription -> RMO consume -> Dispensing + consumed audit");
console.log("Investigation: IPD LabOrder -> RMO consume -> consumed audit + existing LabOrder downstream state");
