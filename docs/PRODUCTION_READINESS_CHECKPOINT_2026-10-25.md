# Production Readiness Checkpoint — 2026-10-25

This is an operational checkpoint, not a HIPAA certification, legal opinion, or clinical-safety attestation. Baseline for this audit: `main` at `fa1d29a3b6f7b1627c33b52192f414ca0982e0f4` (latest commit observed during the audit).

## Current release evidence

- Main CI has recently passed on the current baseline; production verification run [#1254](https://github.com/shukanwadhawana-cloud/medlum-mvp/actions/runs/40207192396) completed successfully for that SHA. This is workflow evidence, not a fresh independent manual test of every clinical workflow.
- PR [#245](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/245) added lab OCR regression coverage and removed the bare `mg` Magnesium alias that could collide with `mg/dL`. Keep OCR output draft-only and require clinician review.
- PR [#227](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/227) merged encrypted R2 backup workflow/runbook code, including encrypted streaming, checksum sidecar, uploaded-object read-back verification, and a written BAA-scope gate. No real production backup or isolated restore has been evidenced by that merge.
- PR [#225](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/225) fixed atomic Telegram facility handshake claiming and passed synthetic CI/deployment checks. The actual hospital owner's Telegram delivery is still unverified.
- PR [#247](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/247) adds original-image OCR fallback. Its build, synthetic runtime checks and secret scan passed at the last observed read, but its P1 integration job was still in progress; do not merge until the exact-head workflow finishes successfully.
- PR [#246](https://github.com/shukanwadhawana-cloud/medlum-mvp/pull/246) contains production verification workflow improvements but is based on an older main SHA. Do not merge it as-is; the equivalent workflow changes are re-proposed by this branch on the current baseline.

## Changes in this checkpoint branch

- Verify health at the canonical `https://medlumhealth.com/api/health` domain, rather than the stale `medlum-mvp.vercel.app` hostname.
- Skip a delayed `workflow_run` health verification when `main` has advanced beyond the triggering commit, avoiding a false failure caused by a stale SHA being compared with a newer production deploy.

## Hard blockers before unrestricted U.S. clinical-data use

1. **Guarded production promotion:** the intended Vercel CLI path has been documented as blocked by missing GitHub Actions `VERCEL_TOKEN` configuration. Configure credentials privately, test the preview/exact-SHA path, then enforce the intended production source policy only after that path works. A green health verification does not prove guarded promotion.
2. **Independent backup and recovery:** configure the dedicated private backup destination, scoped credentials, age recipient and offline private-key escrow; confirm the applicable written BAA scope before any regulated U.S. patient data is exported; execute and verify a real encrypted backup; perform an isolated restore rehearsal and validate schema/migration history, row counts, application reads, and associated object-storage files. No successful production backup/restore has been evidenced.
3. **Provider/legal/security governance:** obtain qualified review of applicable BAAs, data residency, subprocessors, retention/deletion, breach response, access controls, and audit logging before processing U.S. PHI. Encryption alone is not compliance.
4. **Owner-level Telegram acceptance:** generate a fresh single-use link from the owner dashboard, connect the intended facility in the correct Telegram chat, confirm the bot sends the expected confirmation/test notification, and inspect facility status without exposing tokens or chat IDs.
5. **Clinical workflow acceptance:** run authorized synthetic or controlled acceptance for tenant isolation, consultant assignment/transfer, note signing/cancellation audit history, OPD/IPD medication workflows, lab/OCR review, and backup/restore. Keep PACS disabled until its separate end-to-end acceptance passes.

## Secret visibility note

The Vercel environment metadata endpoint returned HTTP 403 in this audit, so this run did not independently verify the current visibility classification of production environment variables and did not read or display any values. Earlier readiness notes report the database/session/OCR secrets as sensitive; reconfirm this in the Vercel dashboard or an authorized metadata query.

## Decision

**Unrestricted U.S. clinical production remains NO-GO.** Treat code as implemented only where merged; treat operational safeguards as complete only after their real-world verification evidence is recorded. Keep PACS disabled and external clinical-AI processing fail-closed until their separate governance and acceptance gates pass.
