# Independent encrypted PostgreSQL backup runbook

This runbook describes the external-backup workflow in `.github/workflows/neon-manual-backup.yml`. The workflow is intentionally fail-closed: it will not upload anything until the GitHub Actions environment and credentials below are configured.

## Destination and access controls

Create a dedicated private Cloudflare R2 bucket for MedLum database backups. Do not reuse a public bucket or grant the access key broad account-wide permissions. Create an R2 API token/access key scoped to the backup bucket with only the object permissions needed to write backup objects (and list/read only if required for operational verification). Store the credentials only as GitHub Actions environment secrets.

Configure GitHub repository Settings → Environments → `production-backups`:

- Restrict deployments to the `main` branch.
- Add environment secret `PRODUCTION_DATABASE_URL` using the existing production database URL; never put it in repository variables or logs.
- Add environment secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` for the bucket-scoped R2 credentials.
- Add environment variable `R2_ACCOUNT_ID`.
- Add environment variable `R2_BUCKET` containing the dedicated private bucket name.
- Add environment variable `AGE_RECIPIENT` containing an age public recipient (starts with `age1`).

Generate the age key pair on a trusted owner-controlled device. Keep the age private identity in an approved password manager/offline encrypted escrow; never put it in GitHub, the repository, the workflow logs, or the R2 bucket. Ensure a recovery operator can retrieve it if the primary owner is unavailable. Loss of the private identity makes the encrypted backups unrecoverable.

## Workflow behavior

- Runs manually or daily at 02:23 UTC, only for `main`.
- Uses a dedicated `production-backups` environment.
- Streams `pg_dump` output directly through age encryption; plaintext dumps are not written to disk.
- Uploads only the encrypted custom-format dump and its SHA-256 checksum sidecar to `s3://<bucket>/medlum/postgres/`.
- Does not use GitHub Actions artifacts, print connection strings, or print dump contents.
- Fails closed when any required environment secret or variable is missing.
- Does not delete old backups. Configure an explicit R2 bucket lifecycle/retention policy after agreeing the retention period and recovery requirements. Verify that lifecycle settings do not expire all copies too early.

The workflow code alone does not establish a backup until the environment, bucket, credentials, encryption recipient, and lifecycle policy are configured and a successful run is verified.

## Restore drill (required before relying on backups)

1. Select an encrypted backup and verify its checksum against the sidecar.
2. On an isolated, access-controlled non-production host, decrypt using the owner-controlled age private identity and pipe the result into a restore process; do not write a plaintext dump to shared storage.
3. Restore into a fresh non-production PostgreSQL target. Never point the restore command at production.
4. Verify schema, Prisma migration history, representative row counts, and application reads using synthetic/approved test data.
5. Separately verify recovery of any associated R2 document/object binaries. A database dump does not contain those objects.
6. Record backup timestamp, recovery-point age, elapsed restore time, validation results, and operator. Keep production untouched during the drill.

## Release gate

Until a successful encrypted off-provider backup and isolated restore drill are evidenced, disaster recovery remains **NO-GO** for unrestricted real clinical data. This mechanism does not replace Neon PITR or a provider plan/BAA decision where applicable.
