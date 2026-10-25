# Workflow Failure Audit and Pending Integration Register — 2026-10-25

This register separates actual code defects from workflow infrastructure failures and integrations that are still awaiting owner/provider setup. It is not a certification or a clinical-safety attestation.

## Executive result

- The repeated October 24–25 CI failures **did not execute their steps**. The failed jobs reported runner ID `0`, zero steps and no actionable logs. Retrying them reproduced the same pattern. These are not failed test assertions and do not show that Gitleaks detected a secret. Do not change correct application code to silence these results.
- The facility Telegram handshake change from PR #222 was merged as main commit `6a6205fe525bb65597d0b6ea3920a02debc5c68b`. Vercel reports that exact commit as `READY` on the production alias, and the live health endpoint returned the same SHA at `2026-10-25T03:12:04Z`. The pilot workflow changes in this PR add a stricter exact-SHA gate; they do not implement the Telegram fix.
- Read-only smoke checks against `https://medlumhealth.com` passed for the health endpoint and login page. An unauthenticated request to `/api/patients` returned HTTP 401 as expected.
- Vercel's native Git integration produced a production deployment even while the repository's separate GitHub Deploy/Verify/Pilot workflows were skipped because CI was not green. This is a release-policy gap. Do not disable direct Git deployments until the guarded deployment mechanism and its required credentials are verified.
- The R2 backup implementation already has a separate open PR #224. This PR deliberately does not duplicate or replace its workflow.

## Audit of failed and skipped workflows

| Workflow / run family | Evidence | Classification | Action |
|---|---|---|---|
| MedLum CI on main, run `40127218369` (latest observed attempt 3) | All four test/build jobs completed as failure before step 1; runner ID 0; zero steps | Runner/Actions execution failure; no test result | Do not rewrite tests. Restore GitHub Actions runner availability and rerun CI on the current main SHA. |
| Secret History Scan on main, run `40127218356` (latest observed attempt 3) | Scan job failed with runner ID 0 and zero steps | Scan did not execute; no evidence of a secret finding | Do not relax Gitleaks or update its allowlist. Restore runner and rerun full-history scan. |
| Desktop Packaging on main, run `40127218414` | Verification job failed before any steps; build matrix was skipped | Runner/Actions execution failure, not packaging assertion | Keep the packaging checks intact; rerun once runners work. |
| PR #222 Telegram handshake CI/Gitleaks runs (`40125491770`, `40125491850`, `40126897544`, `40126897505`, `40126906013`, `40126905986`, `40126067500`, `40126067584`) | Jobs repeatedly reported runner ID 0 or no runner and zero steps | Repeated infrastructure-level failure | The code was already merged and the live production commit is verified. Do not make corrective code changes based on these runs; the dedicated Telegram regression test still needs an actual successful execution. |
| PR #223 CI/Gitleaks runs (`40127203670`, `40127203702`; subsequent branch attempts also show runner ID 0) | No steps ran | Same infrastructure blocker | Keep PR unmerged until checks can actually execute. |
| Production Pilot / Vercel Deploy / Vercel Verify runs following red CI | Workflow conclusion was `skipped` due to explicit successful-CI guard | Expected workflow dependency behavior | No workflow-code correction needed for the skip itself. The independent Vercel Git deployment path must be reviewed because it deployed despite the skipped guarded workflows. |

Prior to this incident, the CI suite and full-history secret scan both passed on main commit `634bf576243d008f4b9bf0063b8c26de3413c7ce` (October 23). The current failed records do not establish regressions against those tests because the runners never executed them.

## Source-level corrections included in this PR

- Production pilot uses Node.js 24, matching the app's declared engine.
- Before running the live smoke checks, the pilot workflow waits for the canonical health endpoint to report the exact commit that passed CI; the smoke script independently checks `EXPECTED_SHA` when provided.
- The backup workflow is intentionally left unchanged here. Encrypted R2 backups belong in the dedicated PR #224, avoiding two competing implementations for the same workflow.

## Integrations that remain genuinely pending

### 1. Facility Telegram: code is deployed; owner-level handshake remains unverified

PR #222 added parsing and validation for Telegram `/start` deep links, one-time-link expiry guidance, webhook URL diagnostics/repair, and a test-notification control. The code is in production at the SHA above. Vercel's available runtime-log window did not show Telegram handshake events, and the selected route error query found no runtime error clusters; neither result proves that Telegram has registered the correct webhook or that a facility chat is linked.

The final live acceptance requires the authorized Master Owner to open MedLum Owner → Hospitals, select the target facility, use **Diagnose / repair webhook**, then generate a fresh connection link, open that exact link in Telegram and press **Start**, and use **Send test notification**. Verify the UI shows the facility as connected and the test notification arrives. This authenticated action was not performed here because no signed-in owner browser session/target facility was available; do not simulate a successful connection or write an unverified Telegram chat ID.

### 2. Durable backups: continue existing PR #224, not a duplicate

PR #224 (`security/encrypted-neon-backups-r2`) already implements a scheduled/manual flow that streams PostgreSQL output through age encryption and uploads only ciphertext and a checksum to a private R2 bucket. It requires the protected GitHub Actions environment `production-backups` to be configured with:

- Secret `PRODUCTION_DATABASE_URL`
- Secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, scoped to the private backup bucket
- Variables `R2_ACCOUNT_ID`, `R2_BUCKET`, and `AGE_RECIPIENT` (public age recipient only)
- Required reviewers and a main-branch restriction
- An owner-held, recoverable age private identity, kept outside GitHub and R2

The code is not a backup until those settings exist and a run succeeds. After Actions execution is restored, run the backup and verify the encrypted object/checksum, then restore into an isolated non-production database and validate migration history, row counts, application reads, and external R2 document objects. Never restore over production. Do not merge a second workflow implementation for the same backup job.

### 3. GitHub Actions runner execution

Inspect repository/account Actions availability, hosted-runner minutes and spending limits, billing state, repository Actions policy and runner restrictions. GitHub's public status page showed no Actions incident recorded for October 24 or 25, 2026; a repository/account-level limit or restriction is therefore worth checking, but is not confirmed by the available run records. The jobs have no runner-generated logs, so the exact cause remains unknown. Do not mark failed checks successful or merge protected work while workflows cannot execute.

### 4. Enforce one production promotion path

The separate GitHub deploy/verify workflows are guarded on CI success, but Vercel's connected Git integration can deploy directly from `main`. Before changing Vercel's production deployment-source policy, verify the guarded CLI path and its required repository secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) through the authorized GitHub settings. Then configure provider-side protection so production promotion requires the reviewed green-SHA release path. Do not disable Git deployments blindly; that could leave no working release path.

### 5. Vercel secret visibility

The Vercel project inspection flagged `DATABASE_URL`, `SESSION_SECRET`, and `OCR_SERVICE_SECRET` as `visibility: config` with `readable-secret` issues. The available connector edit operation does not expose Vercel's required `visibility: secret` field; attempts to change only the variable type were rejected. No values were retrieved, overwritten or deleted. Correct these existing entries through Vercel project settings/API while preserving their values and Production target, then re-check the security warnings.

### 6. U.S. clinical-data readiness

The connected Neon project is observed on the Free plan with `hipaa=false`, six-hour history retention, and no automatic snapshot schedule. The app's Vercel functions run in `iad1`; Neon is in Singapore (`aws-ap-southeast-1`). Until the provider plan/BAA, data-residency decision, risk analysis, incident response, required agreements and a proven independent restore process are completed, MedLum is **not cleared for unrestricted U.S. clinical-data production**. Keep external clinical-AI processing disabled pending authorization and provider/legal/clinical review.

## Go/no-go

**Code deployment verified; GitHub workflow validation and several owner/provider integrations remain blocked.** The correct response to yesterday's red records is to restore execution and rerun the existing checks, not change code without a failing step or assertion. No production migration, live database write, Telegram chat binding, or real-data backup export was performed in this audit.
