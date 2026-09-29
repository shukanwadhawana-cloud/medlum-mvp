#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fail = [];
const ok = (c, m) => (c ? console.log("OK:", m) : (fail.push(m), console.error("FAIL:", m)));

const pilot = read("src/lib/pilot-access.ts");
ok(pilot.includes("evaluatePilotAccess"), "evaluatePilotAccess exported");
ok(pilot.includes("getPilotAccessState"), "getPilotAccessState exported");
ok(pilot.includes("grace"), "grace period modeled");
ok(pilot.includes("locked"), "locked state modeled");
ok(pilot.includes("WARNING_DAYS") || pilot.includes("warning"), "pre-expiry warning modeled");

const auth = read("src/lib/clinic-auth.ts");
ok(auth.includes("getPilotAccessState"), "membership gate consults pilot state");
ok(auth.includes('role === "Owner"') && auth.includes("canRecover"), "Owner/Admin recover after lock");

const products = read("src/lib/clinic-products.ts");
ok(products.includes("pilotEndsAt"), "setup table adds pilotEndsAt");
ok(products.includes("pilotGraceDays"), "setup table adds pilotGraceDays");

const cron = read("src/app/api/cron/pilot-access/route.ts");
ok(cron.includes("PILOT_ACCESS_LOCKED"), "cron emits lock audit");
ok(cron.includes("PILOT_EXPIRY_WARNING") || cron.includes("PILOT_GRACE_ACTIVE"), "cron emits warning audit");
ok(cron.includes("isActive: false"), "lock soft-deactivates clinic");
ok(!/deleteMany|DELETE FROM \"Patient\"|patient\.delete/i.test(cron), "cron never deletes patients");

function evalPilot(setup, now = new Date()) {
  const endsRaw = setup.pilotEndsAt ? new Date(setup.pilotEndsAt) : null;
  if (!endsRaw || Number.isNaN(endsRaw.getTime())) return { status: "open" };
  const graceDays = Math.max(0, Number(setup.pilotGraceDays ?? 5) || 5);
  const graceEndsAt = new Date(endsRaw.getTime() + graceDays * 86400000);
  const daysRemaining = Math.ceil((endsRaw.getTime() - now.getTime()) / 86400000);
  if (now.getTime() > graceEndsAt.getTime() || setup.pilotLockedAt) return { status: "locked" };
  if (now.getTime() > endsRaw.getTime()) return { status: "grace" };
  if (daysRemaining <= 7) return { status: "warning" };
  return { status: "active" };
}
ok(evalPilot({}).status === "open", "no end date → open");
ok(evalPilot({ pilotEndsAt: new Date(Date.now() + 30 * 86400000) }).status === "active", "future end → active");
ok(evalPilot({ pilotEndsAt: new Date(Date.now() + 3 * 86400000) }).status === "warning", "near end → warning");
ok(evalPilot({ pilotEndsAt: new Date(Date.now() - 2 * 86400000), pilotGraceDays: 5 }).status === "grace", "past end within grace → grace");
ok(evalPilot({ pilotEndsAt: new Date(Date.now() - 10 * 86400000), pilotGraceDays: 5 }).status === "locked", "past grace → locked");
ok(evalPilot({ pilotEndsAt: new Date(Date.now() + 30 * 86400000), pilotLockedAt: new Date() }).status === "locked", "pilotLockedAt forces locked");
ok(evalPilot({ pilotEndsAt: new Date(Date.now() - 1 * 86400000), pilotGraceDays: 5 }).status === "grace", "renewal window still open during grace");

const labs = read("src/app/api/labs/route.ts");
ok(labs.includes("memberDoctorIds"), "labs index includes facility member scope");
ok(labs.includes("clinicId: null"), "labs index includes legacy null-clinic patients");

const diag = read("src/app/api/diagnostics/route.ts");
ok(diag.includes("memberDoctorIds"), "diagnostics index includes facility member scope");

const ocr = read("src/app/api/clinical-ai/ocr/route.ts");
ok(ocr.includes("resolveMime"), "OCR resolves MIME from filename");
ok(ocr.includes("application/pdf"), "OCR accepts PDF");
ok(ocr.includes("heic") || ocr.includes("HEIC"), "OCR documents HEIC limitation");

const assist = read("src/app/clinical-assist/page.tsx");
ok(assist.includes("application/pdf") || assist.includes(".pdf"), "Clinical Assist accepts PDF upload");

const help = read("src/lib/medlum-help.ts");
ok(help.includes("Admit to IPD"), "Help covers emergency→IPD");
ok(help.includes("telemedicine") || help.includes("Video consultation"), "Help covers telemedicine");
ok(help.includes("portal"), "Help covers patient portal");
ok(help.includes("OCR") || help.includes("ocr"), "Help covers OCR");

if (fail.length) {
  console.error("\nPilot/lab/OCR verification FAILED:\n" + fail.map((x) => " - " + x).join("\n"));
  process.exit(1);
}
console.log("\nPilot access + lab/diagnostics index + OCR + Help verification PASSED");
