# Production Readiness and Integration Register — 2026-10-25

This is an evidence-based operational checkpoint for MedLum Healthcare. It is not a certification, legal opinion, or clinical-safety attestation. Snapshot baseline: main commit `86fe426b27efd287d4182f28093dbd9c80f7fee9` as checked on 2026-10-25; re-check the exact SHA and workflow state before every release.

## Executive status

**Core application CI is green; guarded production promotion, operational backup/restore, owner-level integration and unrestricted U.S. clinical-data readiness remain blocked or unverified.**

- **Current main checks:** main SHA `86fe426b27efd287d4182f28093dbd9c80f7fee9` passed [MedLum CI #2365](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40206297243), [full-history secret scan #188](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40206297324), and [desktop packaging #809](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40206297213). [Production verification #1253](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40206566708) and [pilot validation #1373](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40206566713) succeeded on that SHA. PACS synthetic E2E is skipped intentionally because PACS remains disabled.
- **Production deployment gate:** [deploy run #749](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40206566710) passed its exact-SHA CI gate and then failed closed because `VERCEL_TOKEN` is missing. This is intended after merged PR [#237](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/237): the workflow no longer treats native Git integration as guarded CLI deployment. Vercel native Git integration remains enabled and can promote independently of GitHub CI. Keep issue [#234](https://github.com/shukanwadhawana-cloud/medlum-mvp/issues/234) open until a token-backed preview and exact-SHA verification pass and deployment-source policy is safely enforced.
- **Health verification host:** the main workflows still referenced `medlum-mvp.vercel.app` despite `medlumhealth.com` being the canonical production domain. This branch updates both checks to `https://medlumhealth.com/api/health` and skips stale CI-triggered verification if main advanced after the originating run. It does not disable native Git deployments.
- **Encrypted backups:** merged PR [#227](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/227) adds the R2 encrypted backup path. Merged PR [#238](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/238) makes the workflow require `R2_BAA_SCOPE_CONFIRMED=CONFIRMED_IN_WRITING` before export. Keep the variable unset until written review confirms the data category, R2 product/account/endpoint/jurisdiction and applicable BAA scope. This is owner attestation, not proof a BAA exists. No real backup or restore has been completed.
- **Secret visibility:** Vercel environment metadata queried without decryption listed `DATABASE_URL`, `SESSION_SECRET`, and `OCR_SERVICE_SECRET` as sensitive/secret. No values were read or printed.
- **Decision:** unrestricted U.S. clinical-data use remains **NO-GO** pending provider agreements/region review, real encrypted backup and isolated restore, guarded release promotion, and documented hospital-owner acceptance. This register is not a legal or clinical-safety certification.

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

GitHub workflow [`.github/workflows/vercel-production-deploy.yml`](https://github.com/shukanwadhawana-cloud/medlum-mvp/blob/main/.github/workflows/vercel-production-deploy.yml) gates on green CI for the exact main SHA and checks the deployed health SHA, but the intended CLI path is **not configured**. The run log for [deploy run 40204769818](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40204769818) explicitly reports `VERCEL_TOKEN` is missing; the `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` values were also empty in that job. It therefore fell back to Vercel’s native Git integration. This is not a fail-closed production promotion path even though the run ended green. [PR #237](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/237) has been opened to remove the silent fallback and make missing-token state visible; it deliberately does not change Vercel's production source policy until the CLI path is tested. The current Vercel project is on the Hobby plan and the production domain is serving the expected SHA.

Required before declaring the release gate complete:
1. Add the GitHub Actions repository secret `VERCEL_TOKEN` without printing or sharing its value. The non-secret team/project identifiers are already wired in the workflow: team `team_dU4dKrRORHc1lsVEv9jFCg4m` / slug `doc-shukan`, project `prj_d2yfp86FdBAYSN3wFfFz4aL4iuRq` (`medlumhealthcare`).
2. Prove the actual guarded GitHub Actions CLI path on a non-production/preview deployment and its exact-SHA verification.
3. Configure Vercel’s production deployment-source policy to block direct Git/integration-origin production promotion while retaining the approved CLI/workflow source; do this only after item 2 succeeds.
4. Run a safe rollback/recovery test, then verify production `/api/health` exposes the intended full SHA, `/login` is reachable, and unauthenticated `/api/patients` returns 401.
5. Do not mark issue #234 resolved until these acceptance criteria are met. Do not disable native production deployment before the guarded CLI path is proven.

### 2. Real independent encrypted backup and restore — NOT YET OPERATIONAL

The workflow `.github/workflows/neon-manual-backup.yml` is on main. It streams a PostgreSQL custom-format dump through `age`, writes only encrypted output to the runner workspace, uploads ciphertext and a portable SHA-256 sidecar to R2, reads back the ciphertext and compares hashes, and verifies both objects exist. The runbook is [`docs/INDEPENDENT_BACKUP_RUNBOOK.md`](INDEPENDENT_BACKUP_RUNBOOK.md).

Required owner/provider setup and proof:
- Environment `production-backups` for the scheduled main-only job (do not require a human reviewer for unattended scheduled runs).
- Separate `production-backups-manual` environment with required reviewers and exact manual confirmation.
- Environment secret `PRODUCTION_DATABASE_URL`; secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; variables `R2_ACCOUNT_ID`, `R2_BUCKET`, `AGE_RECIPIENT` (public recipient only), and `R2_BAA_SCOPE_CONFIRMED=CONFIRMED_IN_WRITING` only after written approval.
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
- **Production hosted app:** health/SHA verification and pilot smoke checks passed on `86fe426`, but guarded deploy #749 failed closed because `VERCEL_TOKEN` is absent. Native Git production builds remain enabled and are not yet gated by the same exact-SHA CI policy.
- **Backup/recovery:** implementation is merged; operational backup/restore is unverified.
- **Telegram live linkage:** owner-authorized hospital acceptance remains pending.
- **U.S. clinical data:** **NO-GO** until provider agreements, risk/governance controls, data-residency decision, independent backup/restore and controlled acceptance are all verified.

No production data export/import, production database migration, restore-over-production, real Telegram chat binding, or real-data R2 backup was performed as part of this work.
