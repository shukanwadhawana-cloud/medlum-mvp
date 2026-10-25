# Production Readiness and Integration Register — 2026-10-25

This is an evidence-based operational checkpoint for MedLum Healthcare. It is not a certification, legal opinion, or clinical-safety attestation. Snapshot baseline: main commit `b698749a42f67bbfb91d8f0c7b9062ff32ad9f5a` (2026-10-25); verify the exact SHA and workflow state before each release.

## Executive status

**Application hardening is improved, but guarded production promotion, operational backup/restore, live owner integration and unrestricted U.S. clinical-data readiness remain blocked or unverified.**

- **Recent code hardening merged:** PR [#238](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/238) enforces a written-approval gate before R2 backup export; PR [#241](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/241) fixes clinical-signature newline delimiters; PR [#244](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/244) advances the note version and stores a `FINAL_SIGNED` version-history row when a second clinician final-signs; PR [#245](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/245) removes the unsafe bare `mg` Magnesium alias and adds lab OCR regression tests; PR [#247](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/247) adds on-device retry with the untouched image when preprocessing or the first OCR pass fails.
- **Exact-SHA evidence:** latest main `b698749a42f67bbfb91d8f0c7b9062ff32ad9f5a` passed MedLum CI [run 40207392926](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207392926), full-history secret scan [40207392901](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207392901), desktop packaging [40207392895](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207392895), production health verification [40207637775](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207637775), and production pilot validation [40207637897](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207637897). Vercel reports a READY production deployment for the same full SHA, and Render reports the same SHA live. The guarded deploy workflow still fails closed because `VERCEL_TOKEN` is missing; the live native Git deployment is evidence of what is serving, not proof that guarded CLI promotion is configured.
- **Release-source control:** Vercel's native Git integration remains enabled and can deploy independently of the guarded CLI path. This PR aligns health verification with the canonical domain and requires the full expected SHA, preserves the token-backed CLI requirement, and adds `.github/workflows/vercel-preview-verify.yml` for a manual, current-main-only preview test. Keep issue [#234](https://github.com/shukanwadhawana-cloud/medlum-mvp/issues/234) open until the owner adds `VERCEL_TOKEN`, the preview workflow passes its exact-SHA health check, and provider-side source policy is validated.
- **Health host drift:** both workflows in this PR use the canonical `https://medlumhealth.com/api/health` endpoint. Verification skips a delayed CI-triggered check when `main` has advanced beyond the triggering SHA, so stale checks are not treated as current release evidence.
- **Backups:** encrypted R2 backup code is merged, and PR [#238](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/238) enforces `R2_BAA_SCOPE_CONFIRMED=CONFIRMED_IN_WRITING` before exporting. Keep the variable unset until written review confirms the data category, R2 product/account/endpoint/jurisdiction and applicable BAA scope. This owner attestation is not proof a BAA exists. No production backup or isolated restore has been completed.
- **Overall decision:** U.S. regulated clinical-data use remains **NO-GO** until provider agreements/data residency, actual encrypted backup and isolated restore, guarded promotion, and authorized hospital-owner acceptance are evidenced.

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

GitHub workflow [`.github/workflows/vercel-production-deploy.yml`](https://github.com/shukanwadhawana-cloud/medlum-mvp/blob/main/.github/workflows/vercel-production-deploy.yml) gates on green CI for the exact main SHA and requires token-backed CLI deployment followed by health-SHA verification. PR #237 is merged and removed the silent fallback. Recent guarded deploy runs fail closed because `VERCEL_TOKEN` is missing; Vercel native Git integration is still enabled and may promote independently of the GitHub gate. Do not change production source settings until a token-backed preview deployment works. The current project is on the Hobby plan.

Required before declaring the release gate complete:
1. Add the GitHub Actions repository secret `VERCEL_TOKEN` without printing or sharing its value. Non-secret team/project identifiers are already wired into the workflow: team `team_dU4dKrRORHc1lsVEv9jFCg4m` / slug `doc-shukan`, project `prj_d2yfp86FdBAYSN3wFfFz4aL4iuRq` (`medlumhealthcare`).
2. Add the owner-managed `VERCEL_TOKEN` secret, manually run [Vercel Preview Verification](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/workflows/vercel-preview-verify.yml) from `main`, and require the protected preview `/api/health` to return the exact full SHA before changing production source policy.
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
- **Production hosted app:** canonical production health currently returns HTTP 200 and the exact `b698749a42f67bbfb91d8f0c7b9062ff32ad9f5a` SHA; `/login` returns HTTP 200; production-pilot run [40207637897](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207637897) passed its unauthenticated patient API and security-header checks. Guarded CLI deploy fails closed because `VERCEL_TOKEN` is absent, and native Git promotion remains enabled independently.
- **Backup/recovery:** implementation is merged; operational backup/restore is unverified.
- **Telegram live linkage:** owner-authorized hospital acceptance remains pending.
- **U.S. clinical data:** **NO-GO** until provider agreements, risk/governance controls, data-residency decision, independent backup/restore and controlled acceptance are all verified.

No production data export/import, production database migration, restore-over-production, real Telegram chat binding, or real-data R2 backup was performed as part of this work.
