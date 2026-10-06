#!/usr/bin/env node
/**
 * Backup / PITR / restore-drill readiness gate.
 * Does NOT claim a live restore succeeded.
 * Verifies documentation, manual backup workflow, secret hygiene,
 * and that Phase A disaster-recovery gate remains present.
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
    failures.push(`Missing required file: ${rel}`);
    return "";
  }
  return readFileSync(p, "utf8");
}

const doc = read("docs/BACKUP_PITR_RESTORE.md");
const dr = read("docs/DISASTER_RECOVERY.md");
const workflow = read(".github/workflows/neon-manual-backup.yml");
const envExample = read(".env.example");
const phaseAGate = read("scripts/verify-disaster-recovery-readiness.mjs");
const pkg = read("package.json");
const health = read("src/app/api/health/route.ts");
const storageIndex = read("src/lib/storage/index.ts");

must(doc.includes("Point-in-time recovery") || doc.includes("PITR"), "BACKUP_PITR_RESTORE.md must cover PITR");
must(doc.includes("Restore drill"), "BACKUP_PITR_RESTORE.md must cover restore drill");
must(doc.includes("MUST NOT overwrite production") || doc.includes("MUST NOT overwrite production".toLowerCase()) || doc.includes("isolated"), "Restore drill must require isolated target");
must(doc.includes("RPO"), "RPO must be documented");
must(doc.includes("RTO"), "RTO must be documented");
must(doc.includes("NOT YET VERIFIED") || doc.includes("REQUIRES EXTERNAL"), "Doc must distinguish verified vs external config");
must(doc.includes("BACKUP_EXISTS") && doc.includes("BACKUP_IS_RECOVERABLE"), "Doc must distinguish exists vs recoverable");
must(!doc.includes("postgresql://user:password@"), "BACKUP_PITR_RESTORE.md must not embed credential-like URLs");

must(dr.length > 500, "Phase A DISASTER_RECOVERY.md must remain");
must(phaseAGate.includes("disaster-recovery readiness"), "Phase A DR gate script must remain");

must(workflow.includes("workflow_dispatch"), "Manual Neon backup workflow must be dispatchable");
must(workflow.includes("pg_dump"), "Manual backup must use pg_dump");
must(workflow.includes("secrets.DATABASE_URL") || workflow.includes("DATABASE_URL"), "Backup workflow must use secret DATABASE_URL");
must(workflow.includes("retention-days"), "Backup artifacts must declare retention");
must(!workflow.includes("postgresql://"), "Backup workflow must not hardcode connection strings");

must(envExample.includes("DATABASE_URL"), ".env.example must document DATABASE_URL placeholder");
must(!/DATABASE_URL\s*=\s*[\"']postgres(ql)?:\/\/[^\"']+@/.test(envExample), ".env.example must not embed a real database URL");
must(!/password@|:[^\s\"']+@/.test(envExample.split("DATABASE_URL")[1]?.slice(0, 80) || ""), ".env.example DATABASE_URL must remain a safe placeholder");

must(pkg.includes("test:disaster-recovery-readiness"), "package.json must keep Phase A DR test script");
must(storageIndex.includes("r2") || storageIndex.includes("R2"), "R2 storage path must remain");

must(health.includes("status"), "health route must exist");
must(!health.includes("DATABASE_URL"), "health route must not reference DATABASE_URL");
must(!health.includes("process.env.SESSION"), "health route must not leak session secrets");

if (failures.length) {
  console.error("MedLum backup/PITR readiness verification FAILED");
  for (const f of failures) console.error("- " + f);
  process.exit(1);
}

console.log("MedLum backup/PITR readiness verification PASSED");
console.log("- BACKUP_PITR_RESTORE.md present with RPO/RTO/isolated restore rules");
console.log("- Manual Neon pg_dump workflow present (secret-based)");
console.log("- Phase A DR doc + gate preserved");
console.log("- No real DB credentials in docs/.env.example/workflow");
console.log("- Health endpoint does not leak secrets");
console.log("- Live restore/PITR still require external verification (documented)");
