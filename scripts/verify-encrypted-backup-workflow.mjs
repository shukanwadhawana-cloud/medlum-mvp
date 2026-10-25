import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/neon-manual-backup.yml", "utf8");
const runbook = readFileSync("docs/INDEPENDENT_BACKUP_RUNBOOK.md", "utf8");

assert.match(workflow, /name: Encrypted Neon Database Backup/);
assert.match(workflow, /cron: "23 2 \\* \\* \\*"/);
assert.match(workflow, /production-backups-manual/);
assert.match(workflow, /production-backups/);
assert.match(workflow, /CREATE_ENCRYPTED_BACKUP/);
assert.match(workflow, /PRODUCTION_DATABASE_URL/);
assert.match(workflow, /R2_ACCESS_KEY_ID/);
assert.match(workflow, /R2_SECRET_ACCESS_KEY/);
assert.match(workflow, /AGE_RECIPIENT/);

// Plaintext must be piped into age, not persisted as a dump file.
assert.match(workflow, /pg_dump "\$DATABASE_URL" --format=custom --no-owner --no-acl\\s*\\\\\\n\\s*\\| age -r "\$AGE_RECIPIENT" -o "\$backup_path"/);
assert.doesNotMatch(workflow, /pg_dump[^\\n]*--file=/);

// Checksum sidecar must remain portable after downloading to another directory.
assert.match(workflow, /cd "\$workdir"\\s+sha256sum "\$backup_name" > "\$backup_name\\.sha256"\\s+sha256sum --check "\$backup_name\\.sha256"/);
assert.doesNotMatch(workflow, /sha256sum "\$backup_path" > "\$backup_path\\.sha256"/);

// The encrypted object is read back and compared before the job reports success.
assert.match(workflow, /remote_sha=.*aws --endpoint-url "\$endpoint" s3 cp .*sha256sum/s);
assert.match(workflow, /Uploaded encrypted backup checksum did not match read-back bytes/);
assert.match(workflow, /s3api head-object/);

// The operational runbook must prohibit unsafe restore targets and require the applicable BAA.
assert.match(runbook, /Business Associate Agreement|BAA/);
assert.match(runbook, /Never point the restore command at production/);
assert.match(runbook, /isolated non-production/);

console.log("Encrypted backup workflow safeguards verified.");
