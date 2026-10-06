#!/usr/bin/env node
/**
 * Deterministic gate: data safety / disaster-recovery readiness.
 * Does NOT invent a backup system. Verifies documentation, migration safety,
 * secret handling, storage durability expectations, and production owner fail-closed.
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

const dr = read("docs/DISASTER_RECOVERY.md");
const safety = read("docs/PRODUCTION_SAFETY.md");
const pkg = read("package.json");
const envExample = read(".env.example");
const owner = read("src/lib/owner.ts");
const sessionSecret = read("src/lib/session-secret.ts");
const migrate = read("scripts/migrate-deploy-with-retry.mjs");
const storageIndex = read("src/lib/storage/index.ts");
const storageProcessed = read("src/lib/storage/processed.ts");
const retentionGate = read("scripts/verify-data-retention-protection.mjs");
const softGate = read("scripts/verify-soft-deactivation.mjs");

must(dr.includes("Neon"), "DR docs must identify Neon as production data store");
must(dr.includes("GitHub"), "DR docs must identify GitHub as recoverable source code");
must(dr.includes("Vercel"), "DR docs must describe Vercel as replaceable hosting");
must(dr.includes("pg_dump") || dr.includes("backup"), "DR docs must describe backup approach");
must(dr.includes("SESSION_SECRET") && dr.includes("DATABASE_URL"), "DR docs must list critical env vars for recovery");
must(!dr.includes("prisma migrate reset"), "DR docs must not recommend migrate reset against production");
must(
  dr.includes("Object storage") || dr.includes("document") || dr.includes("MedicalDocument") || dr.includes("R2"),
  "DR docs must address document/object storage durability"
);

must(
  safety.includes("Never use destructive database reset") || safety.includes("destructive"),
  "PRODUCTION_SAFETY must warn against destructive resets"
);

must(pkg.includes("db:migrate:deploy"), "package.json must expose migrate deploy");
must(
  pkg.includes("db push disabled") || (pkg.includes("db:push") && pkg.includes("exit 1")),
  "db:push must be disabled for production safety"
);
must(migrate.includes("prisma") && migrate.includes("migrate"), "migrate-deploy-with-retry must invoke prisma migrate");
must(existsSync(join(root, "prisma/migrations/migration_lock.toml")), "Prisma migration lock must exist");

must(envExample.includes("DATABASE_URL"), ".env.example must document DATABASE_URL placeholder");
must(envExample.includes("SESSION_SECRET"), ".env.example must document SESSION_SECRET placeholder");
must(!/DATABASE_URL\s*=\s*["']postgres(ql)?:\/\/[^"']+@/.test(envExample), ".env.example must not embed a real database URL");
must(
  sessionSecret.includes("SESSION_SECRET must be configured") || sessionSecret.includes("secret.length"),
  "session-secret must validate production secret"
);

must(owner.includes("MEDLUM_OWNER_EMAIL"), "owner recognition must use MEDLUM_OWNER_EMAIL");
must(
  owner.includes('NODE_ENV === "production"') || owner.includes("VERCEL_ENV"),
  "owner.ts must fail-closed in production when MEDLUM_OWNER_EMAIL is unset"
);
must(
  /production[\s\S]{0,200}return \[\]/.test(owner) || /return \[\][\s\S]{0,120}BOOTSTRAP/.test(owner),
  "production without MEDLUM_OWNER_EMAIL must return empty owner list (fail-closed)"
);

must(storageIndex.includes("getStorageProvider"), "storage provider factory must exist");
must(storageIndex.includes("r2") || storageIndex.includes("R2"), "R2 durable storage path must exist");
must(
  storageProcessed.includes("getObject") && storageProcessed.includes("null"),
  "processed provider must document non-retention (getObject null)"
);
must(
  storageIndex.includes("isServerlessRuntime") || storageIndex.includes("VERCEL") || storageIndex.includes("production"),
  "storage must detect serverless/production runtime"
);

must(retentionGate.includes("onDelete") && retentionGate.includes("Restrict"), "data-retention Restrict gate must remain");
must(softGate.includes("isActive") && softGate.includes("deactivatedAt"), "soft-deactivation gate must remain");

if (failures.length) {
  console.error("MedLum disaster-recovery readiness verification FAILED");
  for (const f of failures) console.error("- " + f);
  process.exit(1);
}

console.log("MedLum disaster-recovery readiness verification PASSED");
console.log("- DISASTER_RECOVERY.md covers Neon data, GitHub code, Vercel hosting recovery");
console.log("- Production migrate uses deploy; db push disabled");
console.log("- Secrets stay in env; session secret validated");
console.log("- Platform owner fails closed in production without MEDLUM_OWNER_EMAIL");
console.log("- Object storage: R2 path present; processed provider non-durable (documented)");
console.log("- PHI retention Restrict + soft-deactivation gates remain");
