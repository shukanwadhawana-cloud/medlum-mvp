# MedLum Production Readiness Findings — 2026-10-22

This is a dated operational snapshot, not a certification or a permanent statement of provider configuration. Re-check provider settings before each production release.

## Verified application and release controls

- Production host: https://medlumhealth.com
- Current verified production commit at this update: `080bddda36a296952d7242ad5a63117cca9e89bf` (PR #205, Diagnostics production error handling).
- Read-only live smoke checks passed: `/api/health` returned `status: ok` and the same commit SHA; `/login` was reachable; unauthenticated `/api/patients` returned HTTP 401 as expected.
- Vercel reports the current production deployment READY, and the GitHub combined status for this commit reports success for both the MedLum Health and OCR Vercel checks. These checks do not prove every authenticated workflow works end to end.
- Node 24 is declared in `package.json`, `.nvmrc`, the Docker base image and CI. Full-history secret scanning is enabled for pull requests, main pushes, weekly execution and manual dispatch. Its configuration allowlists only four reviewed legacy localStorage namespace identifiers, not an entire source file.
- External clinical-AI processing is fail-closed unless explicitly opted in. Do not enable external processing for real patient data until facility consent/admin controls, provider terms/retention, regional transfers and applicable clinical/legal requirements are approved.
- Tariff Excel import uses the official SheetJS 0.20.3 tarball and rejects invalid/oversized base64/workbooks and worksheet dimensions above configured limits.
- The Vercel build pipeline runs `npm run build` only. It does not run Prisma migrations as a side effect.

## Controlled production migration workflow

The manual GitHub Actions workflow `Production Database Migrations` is deliberately fail-closed. Before using it, a repository administrator must configure the GitHub Actions environment `production-migrations` with:
1. Required reviewer(s) and branch restrictions.
2. Environment secret `PRODUCTION_DATABASE_URL` pointing to the existing production Neon database.
3. Environment variable `PRODUCTION_MIGRATIONS_ENABLED=true`.

The default workflow operation is read-only `status`. Applying migrations requires choosing `deploy` and entering `APPLY_PRODUCTION_MIGRATIONS`. It does not run automatically during a normal Vercel deployment. No production migration was executed as part of this audit. Do not run this workflow against production until those environment gates, migration SQL review and a verified recovery path are in place.

## Provider settings observed during this update

### Neon PostgreSQL

- Project: `fancy-base-43628455`; primary/default branch: `production` (`br-muddy-moon-b3072mrq`), state ready.
- Connected project reports Neon Free plan and six-hour history/PITR window (`21600` seconds). The project's Neon HIPAA configuration flag is `false`; no BAA status was verified. Do not represent this setup as HIPAA-enabled or compliant.
- An automatic snapshot schedule is still empty. An attempt to configure a daily schedule was rejected by Neon with “backup schedule creation is not enabled for this project.”
- An attempt to protect the production branch was rejected because the current plan has reached its protected-branch limit. The production branch remains unprotected.
- The manual snapshot `MEDLUM-RESTORE-DRILL-2026-10-22` (`snap-cold-truth-b3ekfycs`) currently reports expiry **2026-11-22 00:00 UTC**. Keep in mind this is a temporary manual snapshot, not a recurring or independent backup.
- A read-only restore comparison previously found 48 public base tables, 32 completed Prisma migrations and matching per-table row counts/digests between restored and fallback branches. This is evidence of logical consistency, not proof of external R2/object-store integrity or an independent off-provider backup.
- No independent backup schedule has been established. A durable backup requires either an eligible Neon plan with automated backups/PITR, or a separately secured backup mechanism (for example encrypted PostgreSQL dumps to private external storage), with documented retention and restore tests. Do not put patient data or database dumps in GitHub source control or ordinary workflow artifacts.

### Vercel environment-variable visibility

- The connected Vercel project is `medlumhealthcare`; canonical production host is `medlumhealth.com`.
- Eleven production variables were successfully changed to sensitive/secret visibility: `MEDLUM_OWNER_EMAIL`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_KEY_ID`, `OCR_SERVICE_URL`, `VIDEO_BASE_URL`, `VIDEO_PROVIDER`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `GMAIL_SMTP_APP_PASSWORD`, and `GMAIL_SMTP_USER`.
- Three variables remain flagged by Vercel as readable secrets: `DATABASE_URL`, `SESSION_SECRET`, and `OCR_SERVICE_SECRET`. The connected Vercel edit action does not expose the required visibility field, and attempts to set it were rejected by schema validation. They have **not** been represented as fixed. Remediation requires the Vercel dashboard or an API/action that supports secret visibility; preserve existing values and do not delete/recreate production credentials blindly.
- Vercel region remains `iad1` while Neon is in Singapore (`aws-ap-southeast-1`). PR #194 remains on hold pending an approved plan/cost decision; do not change regions or upgrade the plan without owner approval.

## Remaining release blockers

1. **Durable independent backups and recovery:** configure an eligible backup service/plan or an encrypted, access-controlled external backup mechanism. Record retention, restore-point age and access ownership.
2. **Isolated full restore drill:** restore into a non-production target; verify schema and Prisma migration history, critical row counts, synthetic-data application reads and document/object-store binaries separately. Record elapsed recovery time and recovery-point age while leaving production untouched.
3. **Protected migration environment:** configure `production-migrations` with required reviewers, branch restrictions, `PRODUCTION_DATABASE_URL` and `PRODUCTION_MIGRATIONS_ENABLED=true`; run only the read-only status operation after review.
4. **Vercel secret visibility:** resolve the three remaining readable-secret flags using a supported dashboard/API path without changing credential values unexpectedly; verify a fresh production deployment after the change.
5. **Plan-level controls:** resolve Neon backup-schedule and protected-branch limits through an approved plan change or an approved alternative design.
6. **Regional pricing:** retain `iad1` unless Pro eligibility and Singapore regional charges are approved.
7. **Clinical-AI governance:** keep external processing disabled until facility-level authorization/consent and provider/legal/clinical reviews are complete.
8. **Historical secret exposure and access review:** a clean scan is not proof that no credential was ever exposed. Rotate/revoke any real credential if discovered. Verify GitHub repository visibility/collaborators and Neon project permissions through provider settings.

## Go/no-go

**Status: Hardened application, not yet cleared for unrestricted real clinical data.** The live deployment and basic read-only smoke checks are healthy. Remaining blockers include durable independent backup/restore resilience, owner setup for protected migrations, three Vercel secret-visibility flags, plan-level Neon controls, regional pricing and clinical-AI governance.

No production schema migration was applied as part of this audit.
