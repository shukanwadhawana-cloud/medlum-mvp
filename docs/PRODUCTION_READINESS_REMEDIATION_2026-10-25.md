# Production Readiness and Integration Register — 2026-10-25

This is an evidence-based operational checkpoint for MedLum Healthcare. It is not a certification, legal opinion, or clinical-safety attestation. Snapshot baseline: main commit `e97ae8f2cae0682efaf2a228fa6e112e63eeee61`; re-check the current main SHA and run status before each release.

## Executive status

**Software hardening has advanced; unrestricted U.S. clinical-data readiness remains NO-GO.** Code and tests cannot substitute for provider contracts, security governance, owner-level integrations, an actual independent backup, and a successful isolated restore.

- The facility data-migration hardening PR #235 is merged as `e97ae8f2cae0682efaf2a228fa6e112e63eeee61`. Its exact-head MedLum CI and full-history secret scan passed before merge. A new main CI run was started on that SHA; see [main CI run 40204503922](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40204503922) for its final result before promotion.
- The Vercel project `medlumhealthcare` reported a READY production deployment for the same SHA. At the time of the audit, the corresponding GitHub main CI run was still in progress. This is evidence that native Vercel Git integration can promote independently of the gated GitHub workflow, and is a production-release-control gap tracked in [issue #234](https://github.com/shukanwadhawana-cloud/medlum-mvp/issues/234).
- The encrypted R2 backup workflow and runbook are already on main at `65c74356d753caacaea7672c570d2f243ee63c16`. Redundant PR #231 has been closed as superseded; its workflow and runbook blobs were identical to main and main additionally contains the backup regression test/CI wiring. This proves code is present, **not** that a real backup was created or can be restored.
- Safe REA-assisted engineering guardrails are merged in [`AGENTS.md`](../blob/main/AGENTS.md) and [`docs/REA_ENGINEERING_WORKFLOW.md`](REA_ENGINEERING_WORKFLOW.md). REA is a developer-time investigative aid, not a production dependency. No REA runtime installation or autonomous investigation is claimed by this register.
- Vercel’s environment listing (queried without decrypting values) showed the previously flagged `DATABASE_URL`, `SESSION_SECRET`, and `OCR_SERVICE_SECRET` as `type: sensitive`, `visibility: secret`, with no listed security issues. No values were displayed.

## Verified code and automated test evidence

### Tenant-scoped facility data migration

PR [#235](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/235) passed exact-head CI run [40184110454](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40184110454) and full-history secret scan [40184110407](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40184110407) before merge.

The merged path adds owner-only export/import routes, streamed 20 MB request limits, per-table row caps, schema/type/unique-ID and source-hash validation, source-package foreign-key checks, existing-row collision preflight, server-derived target facility mapping, sensitive field exclusions, a transactional audit record, and generic error responses. Non-draft/signed clinical notes and their associated signed/version history are deferred rather than silently copied with invalid source signatures. Import writes are fail-closed: setting `MEDLUM_DATA_MIGRATION_IMPORT_ENABLED=true` is required for execute mode; otherwise execution returns a locked response and preflight remains non-writing. **Do not enable this flag or use production records until a reviewed, synthetic, isolated migration rehearsal passes.**

The source-level regression check is `npm run test:data-migration-security`; it passed in the PR’s exact-head CI. Full main CI and downstream release checks must pass on the current SHA before treating the merge as release-verified.

### REA-assisted engineering

REA installation and execution should occur only on a developer-controlled machine using synthetic fixtures. The repo instructions cover Telegram handshake, consultant assignment/transfer, clinical-note signing/cancellation, OCR/report identity, backup/restore, and tenant isolation. Do not send real PHI, production exports/logs, credentials, cookies, decrypted variables, or real clinical images/documents to REA or an external model. Every finding still requires source inspection, a reproduced synthetic case, regression tests, human review, and exact-SHA release evidence.

### Telegram / clinical / imaging

- **Facility Telegram handshake:** code and regression safeguards are deployed in the codebase, including atomic binding protections. The specific hospital-owner connection is not yet verified end to end. An authorized owner must diagnose/repair the webhook if required, issue a fresh connection link, open it in the correct Telegram chat, press Start, and receive the MedLum test notification. Do not infer a link from passing unit tests or write an unverified chat ID.
- **Consultant assignment/transfer and clinical-note workflows:** the repository has dedicated regression/runtime checks (including the owner facility onboarding and consultant assignment/transfer acceptance tests), but those tests do not replace a live authorized hospital workflow acceptance. Review duplicate or stale PRs against current main before merging; do not merge old variants merely because their branches are green.
- **OCR / Clinical Assist:** synthetic runtime acceptance covers authenticated routing and checksum-linked draft behavior. OCR output remains an unverified draft; no clinical result should be auto-finalized from OCR. External clinical AI remains disabled unless facility authorization, provider terms, retention/data-transfer controls, and legal/clinical review are approved.
- **PACS:** synthetic PACS jobs are skipped/not accepted as a production workflow in the checks reviewed here. Keep PACS disabled until a separate, documented end-to-end acceptance is completed.

## Operational gates still open

### 1. One guarded production promotion path — BLOCKED

GitHub workflow [`.github/workflows/vercel-production-deploy.yml`](../blob/main/.github/workflows/vercel-production-deploy.yml) is configured to deploy the exact main SHA only after successful exact-SHA CI and to check the deployed health SHA. However, it currently permits a fallback when `VERCEL_TOKEN` is absent, relying on Vercel’s native Git integration. Project/deployment inspection confirms that the connected Git integration can produce a READY production deployment while the corresponding GitHub CI is still in progress.

Required before declaring the release gate complete:
1. Confirm the GitHub Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` exist and are correctly scoped **without displaying their values**.
2. Prove the actual guarded GitHub Actions CLI path on a non-production/preview deployment and its exact-SHA verification.
3. Configure Vercel’s production deployment-source policy to block direct Git/integration-origin production promotion while retaining the approved CLI/workflow source; do this only after item 2 succeeds.
4. Run a safe rollback/recovery test, then verify production `/api/health` exposes the intended full SHA, `/login` is reachable, and unauthenticated `/api/patients` returns 401.
5. Do not mark issue #234 resolved until these acceptance criteria are met. Do not disable native production deployment before the guarded CLI path is proven.

### 2. Real independent encrypted backup and restore — NOT YET OPERATIONAL

The workflow `.github/workflows/neon-manual-backup.yml` is on main. It streams a PostgreSQL custom-format dump through `age`, writes only encrypted output to the runner workspace, uploads ciphertext and a portable SHA-256 sidecar to R2, reads back the ciphertext and compares hashes, and verifies both objects exist. The runbook is [`docs/INDEPENDENT_BACKUP_RUNBOOK.md`](INDEPENDENT_BACKUP_RUNBOOK.md).

Required owner/provider setup and proof:
- Environment `production-backups` for the scheduled main-only job (do not require a human reviewer for unattended scheduled runs).
- Separate `production-backups-manual` environment with required reviewers and exact manual confirmation.
- Environment secret `PRODUCTION_DATABASE_URL`; secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; variables `R2_ACCOUNT_ID`, `R2_BUCKET`, `AGE_RECIPIENT` (public recipient only).
- Private bucket with scoped read/write access, lifecycle/retention policy, monitoring/alerting, and a recoverable owner-held age private key kept separately from GitHub and R2.
- A successful backup workflow run, evidence the expected encrypted objects and checksums exist, then a full isolated restore drill into a new non-production database. Verify schema and Prisma migration history, critical table row counts, application reads using synthetic/approved data, and separately stored object/document binaries. Record restore time and recovery-point age. Never restore over production.

Cloudflare’s R2 service and account must be confirmed in writing to be covered by the applicable signed BAA before uploading U.S. regulated patient backups. Encryption by itself is not HIPAA compliance. If BAA scope is unavailable, use a destination contractually covered for the intended data.

### 3. Protected production migrations — OWNER CONFIGURATION REQUIRED

The workflow `Production Database Migrations` is intentionally manual and fail-closed. Configure the `production-migrations` GitHub Actions environment with required reviewers, main/approved-branch restrictions, secret `PRODUCTION_DATABASE_URL`, and `PRODUCTION_MIGRATIONS_ENABLED=true`. Perform a read-only status run first. Applying migrations requires the separate explicit deploy choice/confirmation and reviewed migration SQL, a verified recovery path, and an approved release plan. No production migration was performed as part of this audit.

### 4. U.S. data and HIPAA readiness — NO-GO

The most recent recorded provider audit (2026-10-22) observed Neon on the Free plan, Neon HIPAA configuration flag `false`, a six-hour history/PITR window, no automatic snapshot schedule, database region Singapore (`aws-ap-southeast-1`), and Vercel functions in `iad1`. Those are dated observations, not an assertion that current settings cannot have changed; re-check provider dashboards directly before a new release. No signed BAA or applicable service scope was verified.

Before handling real U.S. regulated clinical data, the accountable owner must complete and document:
- Eligible provider plans, signed BAAs and services/regions covered by each agreement; approved data-residency/transfer architecture and explicit plan/cost decision.
- HIPAA Security Rule risk analysis and risk-management plan, safeguards and role/access reviews, audit log/retention, incident response, breach handling, business continuity and disaster recovery.
- Independent encrypted backups and a successful isolated restore, document/object storage recovery, and tested restore procedures.
- Vendor/AI privacy, consent/authorization, retention, subprocessors and cross-border-transfer review; clinical governance and human oversight; applicable FDA/ONC scope and state-specific legal review with qualified counsel where relevant.
- Security review of repository visibility/access, GitHub collaborators, Vercel/Neon permissions, production credentials, secret rotation/history, and incident response plan.
- A controlled pilot using synthetic data before any authorized real-patient pilot. Green CI, a successful health check, encrypted storage, or a `hipaa` settings flag alone is not proof of compliance.

**Important:** the repository is currently public according to the GitHub repository metadata observed during this audit. I have not changed its visibility because that is an owner-impacting access decision. Review whether the source should be private and assess collaborator/fork access; do not assume changing visibility retroactively erases existing forks or clones.

## Release decision

- **Code hygiene/testing:** substantially hardened; verify current main CI and deployment workflows on the exact current SHA.
- **Production hosted app:** a READY Vercel deployment exists at the checkpoint, but promotion policy has an unresolved native-Git bypass.
- **Backup/recovery:** implementation is merged; operational backup/restore is unverified.
- **Telegram live linkage:** owner-authorized hospital acceptance remains pending.
- **U.S. clinical data:** **NO-GO** until provider agreements, risk/governance controls, data-residency decision, independent backup/restore and controlled acceptance are all verified.

No production data export/import, production database migration, restore-over-production, real Telegram chat binding, or real-data R2 backup was performed as part of this work.
