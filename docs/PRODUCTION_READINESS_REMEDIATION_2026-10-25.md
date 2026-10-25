# Production Readiness and Integration Register — 2026-10-25

This is an evidence-based operational checkpoint for MedLum Healthcare. It is not a certification, legal opinion, or clinical-safety attestation. Re-check the exact main SHA, workflow state, provider configuration, and production health before each release.

## Live status refresh — 2026-10-25 15:33 UTC

**Current main SHA at this snapshot:** `b698749a42f67bbfb91d8f0c7b9062ff32ad9f5a` (PR #247, on-device original-image OCR fallback, merged).

- **CI:** current main run [40207392926](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207392926) was still running when checked. Owner facility onboarding runtime and Clinical Assist runtime acceptance had passed; the full-history secret scan [40207392901](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207392901) and desktop packaging configuration check passed. Desktop Windows/macOS builds and main build/P1 integration were still in progress. PACS synthetic E2E was skipped intentionally; do not treat that as PACS acceptance.
- **Production verification race:** verify run [40207409173](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207409173) was marked successful, but its job log shows it verified `fa1d29a3b6f7b1627c33b52192f414ca0982e0f4` while `main` had already advanced to `b698749a42f67bbfb91d8f0c7b9062ff32ad9f5a`. This is stale verification and is not evidence that the current main SHA was served. The follow-up PR adds a main-SHA guard and uses the canonical `https://medlumhealth.com/api/health` endpoint.
- **Deployment:** deploy run [40207409131](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207409131) failed closed because its target SHA `fa1d29a` was stale versus main `b698749`; it stopped before the guarded Vercel CLI step. This is preferable to deploying an older commit, but it does not prove a successful current-SHA deployment. The independent release-control gap remains: a token-backed Vercel CLI deployment has not been proven. The known missing `VERCEL_TOKEN` must be configured as a GitHub Actions secret before that gate can pass.
- **Live provider status:** the GitHub status API showed Vercel's `medlumhealthcare` deployment as pending at the time of this snapshot. The prior recorded health/login/API smoke checks on an earlier commit cannot be carried forward to this SHA without a fresh exact-SHA smoke test.
- **Backups and restore:** encrypted R2 backup code and read-back/checksum logic are present, but no current evidence proves a real independent backup was created and restored into an isolated database, including separately stored document objects.
- **Telegram:** atomic handshake protections and tests exist, but the real facility-owner binding and actual delivery to the owner's Telegram chat remain unverified.
- **United States clinical data:** **NO-GO** until applicable BAAs/service scope, data-flow and residency decisions, security governance, guarded deployment, recovery evidence, and controlled owner acceptance are documented. CI, encryption alone, and a health endpoint do not establish HIPAA compliance.

## Release handling

- Do not merge a stale readiness branch solely because it was previously green. Refresh it on current main and require checks on the refreshed head.
- Treat stale deployment runs as failures; treat stale verification runs as skips that must not be used as current release evidence.
- Do not disable Vercel's native production deployment source until a token-backed CLI/preview path, exact-SHA gate, rollback and recovery process have all been proven. Do not bypass a failing/pending CI gate.
- Never use production patient data for acceptance tests. Do not perform production migrations, data imports, real-data backups, or restore-over-production as part of release verification.

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

GitHub workflow [`.github/workflows/vercel-production-deploy.yml`](https://github.com/shukanwadhawana-cloud/medlum-mvp/blob/main/.github/workflows/vercel-production-deploy.yml) gates on green CI for the exact main SHA and checks the deployed health SHA, but the intended CLI path is **not configured**. The run log for [deploy run 40204769818](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40204769818) explicitly reports `VERCEL_TOKEN` is missing. The non-secret team/project identifiers are now wired in the workflow; only the access token belongs in GitHub Actions Secrets. It therefore fell back to Vercel’s native Git integration. This is not a fail-closed production promotion path even though the run ended green. [PR #237](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/237) removed the silent fallback and made missing-token state visible; it deliberately does not change Vercel's production source policy until the CLI path is tested. The current Vercel project is on the Hobby plan and the production domain is serving the expected SHA.

Required before declaring the release gate complete:
1. Create/configure the GitHub Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` (current workflow logs confirm these are absent/empty) without printing any values. The account/team and project identifiers are available in Vercel: team `team_dU4dKrRORHc1lsVEv9jFCg4m` / slug `doc-shukan`, project `prj_d2yfp86FdBAYSN3wFfFz4aL4iuRq` (`medlumhealthcare`).
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
- **Production hosted app:** live health reports `status: ok` on the exact tested SHA and the main CI/deploy/verify/pilot checks are green; the deployment workflow still falls back to native Git because its CLI token/configuration is missing.
- **Backup/recovery:** implementation is merged; operational backup/restore is unverified.
- **Telegram live linkage:** owner-authorized hospital acceptance remains pending.
- **U.S. clinical data:** **NO-GO** until provider agreements, risk/governance controls, data-residency decision, independent backup/restore and controlled acceptance are all verified.

No production data export/import, production database migration, restore-over-production, real Telegram chat binding, or real-data R2 backup was performed as part of this work.
