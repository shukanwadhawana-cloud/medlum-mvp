#!/usr/bin/env node
/**
 * Restore-drill checklist gate.
 * Ensures the isolated restore procedure is documented and that the checklist
 * cannot pass without the required recovery artifacts in-repo.
 * Does NOT connect to production or perform a live restore.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
function must(cond, msg) {
  if (!cond) failures.push(msg);
}
function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    failures.push(`Missing: ${rel}`);
    return "";
  }
  return readFileSync(p, "utf8");
}

const doc = read("docs/BACKUP_PITR_RESTORE.md");
const dr = read("docs/DISASTER_RECOVERY.md");
const workflow = read(".github/workflows/neon-manual-backup.yml");

const requiredPhrases = [
  ["isolated", "Isolated restore target required"],
  ["pg_restore", "pg_restore mentioned as restore tool"],
  ["schema", "Schema validation in drill"],
  ["facility isolation", "Facility isolation check in drill"],
  ["authentication", "Authentication check in drill"] ,
  ["Audit", "Audit records mentioned"],
  ["Teardown", "Teardown of isolated target"],
];

for (const [needle, label] of requiredPhrases) {
  must(doc.toLowerCase().includes(needle.toLowerCase()), `Restore drill doc missing: ${label}`);
}

must(workflow.includes("pg_dump"), "Backup workflow must exist to obtain a dump for drills");
must(dr.includes("Neon") || dr.includes("PostgreSQL"), "Phase A DR must still describe Neon/Postgres");

// Explicit anti-patterns
must(!doc.includes("drop database production"), "Must not document destructive production drops");
must(!/prisma\s+migrate\s+reset/i.test(doc), "Must not recommend migrate reset on production");

if (failures.length) {
  console.error("MedLum restore-drill checklist FAILED");
  for (const f of failures) console.error("- " + f);
  process.exit(1);
}

console.log("MedLum restore-drill checklist PASSED (documentation only)");
console.log("Checklist for operators (live drill — not executed by this script):");
const steps = [
  "1. Obtain dump or Neon PITR branch (non-prod)",
  "2. Provision isolated empty database",
  "3. pg_restore into isolated target only",
  "4. Verify schema / critical tables",
  "5. App connect with isolated DATABASE_URL",
  "6. Auth + facility isolation smoke (read-only preferred)",
  "7. Confirm audit readability if present",
  "8. Teardown isolated DB; purge dumps",
];
for (const s of steps) console.log(s);
