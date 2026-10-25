import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/neon-manual-backup.yml", "utf8");
const runbook = readFileSync("docs/INDEPENDENT_BACKUP_RUNBOOK.md", "utf8");
const normalizedWorkflow = workflow.replace(/\\\\\\s*\\n\\s*/g, " ");

for (const required of [
  'name: Encrypted Neon Database Backup',
  'cron: "23 2 * * *"',
  "production-backups-manual",
  "production-backups",
  "CREATE_ENCRYPTED_BACKUP",
  "PRODUCTION_DATABASE_URL",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "AGE_RECIPIENT",
]) {
  assert.ok(workflow.includes(required), `Backup workflow missing required safeguard: ${required}`);
}

// Plaintext must be streamed into age rather than persisted as a dump file.
assert.ok(
  normalizedWorkflow.includes('pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl | age -r "$AGE_RECIPIENT" -o "$backup_path"'),
  "Database dump must stream directly through age encryption",
);
assert.ok(!/pg_dump[^\\n]*--file=/.test(workflow), "Plaintext pg_dump file output is forbidden");

// The checksum sidecar must use a portable basename and be checked locally.
assert.ok(workflow.includes('cd "$workdir"'), "Checksum generation must use the backup directory");
assert.ok(workflow.includes('sha256sum "$backup_name" > "$backup_name.sha256"'));
assert.ok(workflow.includes('sha256sum --check "$backup_name.sha256"'));
assert.ok(!workflow.includes('sha256sum "$backup_path" > "$backup_path.sha256"'));

// The uploaded ciphertext must be read back and verified before success.
assert.ok(
  normalizedWorkflow.includes('aws --endpoint-url "$endpoint" s3 cp "s3://${R2_BUCKET}/medlum/postgres/$backup_name" - --only-show-errors | sha256sum'),
  "Uploaded encrypted backup must be read back for hash verification",
);
assert.ok(workflow.includes("Uploaded encrypted backup checksum did not match read-back bytes"));
assert.ok(workflow.includes("s3api head-object"));

// The runbook must prohibit production restores and document the applicable BAA gate.
assert.ok(/Business Associate Agreement|BAA/.test(runbook));
assert.ok(runbook.includes("Never point the restore command at production"));
assert.ok(runbook.includes("isolated non-production"));

console.log("Encrypted backup workflow safeguards verified.");
