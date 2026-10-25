# Independent encrypted PostgreSQL backup runbook

This runbook describes the external-backup workflow in `.github/workflows/neon-manual-backup.yml`. The workflow fails closed until the GitHub Actions environments, R2 bucket and credentials are configured and a successful export has been verified.

## Destination and access controls

Create a dedicated private Cloudflare R2 bucket for MedLum database backups. Do not reuse a public bucket or grant the access key broad account-wide permissions. Create an R2 API token/access key scoped to the backup bucket with only the object permissions needed to write backup objects (and list/read only if required for operational verification). Store credentials only as GitHub Actions environment secrets.

The workflow uses two environments intentionally so scheduled backups are not blocked by a manual review gate:

### `production-backups` — scheduled unattended backups

- Restrict deployments to the `main` branch.
- **Do not configure required reviewers on this environment**: GitHub requires environment approval before a protected job can run, which would block unattended scheduled backups.
- Add environment secret `PRODUCTION_DATABASE_URL` using the existing production database URL; never put it in repository variables or logs.
- Add environment secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` for the bucket-scoped R2 credentials.
- Add environment variables `R2_ACCOUNT_ID`, `R2_BUCKET`, and `AGE_RECIPIENT`.

### `production-backups-manual` — manually requested backups

- Restrict deployments to the `main` branch.
- Require designated reviewer(s) before a manual backup run may access the environment.
- Copy the same `PRODUCTION_DATABASE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`, and `AGE_RECIPIENT` configuration into this environment.
- Manual dispatch must include the exact confirmation `CREATE_ENCRYPTED_BACKUP`.

Generate the age key pair on a trusted owner-controlled device. Keep the age private identity in an approved password manager/offline encrypted escrow; never put it in GitHub, the repository, the workflow logs, or the R2 bucket. Ensure a recovery operator can retrieve it if the primary owner is unavailable. Loss of the private identity makes the encrypted backups unrecoverable.

## Workflow behavior

- Runs daily at 02:23 UTC on `main` and can also be dispatched manually from `main`.
- Scheduled runs use the no-review `production-backups` environment and do not wait for manual approval. Manual runs use `production-backups-manual` and require both review and explicit confirmation.
- Streams `pg_dump` output directly through age encryption; plaintext dumps are not written to disk.
- Uploads only the encrypted custom-format dump and its SHA-256 checksum sidecar to `s3://<bucket>/medlum/postgres/`.
- Does not use GitHub Actions artifacts, print connection strings, or print dump contents.
- Fails closed when any required environment secret or variable is missing or malformed.
- Does not delete old backups. Configure an explicit R2 bucket lifecycle/retention policy after agreeing the retention period and recovery requirements. Verify that lifecycle settings do not expire all copies too early.

The workflow code alone does not establish a backup until the environments, bucket, credentials, encryption recipient, lifecycle policy, and successful run have been verified. Do not claim backup coverage before the first successful upload.

## Restore drill (required before relying on backups)

1. Select an encrypted backup and verify its checksum against the sidecar.
2. On an isolated, access-controlled non-production host, decrypt using the owner-controlled age private identity and pipe the result into a restore process; do not write a plaintext dump to shared storage.
3. Restore into a fresh non-production PostgreSQL target. Never point the restore command at production.
4. Verify schema, Prisma migration history, representative row counts, and application reads using synthetic/approved test data.
5. Separately verify recovery of any associated R2 document/object binaries. A database dump does not contain those objects.
6. Record backup timestamp, recovery-point age, elapsed restore time, validation results, and operator. Keep production untouched during the drill.

## Release gate

Until a successful encrypted off-provider backup and isolated restore drill are evidenced, disaster recovery remains **NO-GO** for unrestricted real clinical data. This mechanism does not replace Neon PITR or a provider plan/BAA decision where applicable.
