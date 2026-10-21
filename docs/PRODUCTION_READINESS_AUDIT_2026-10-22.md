# MedLum Production Readiness Findings — 2026-10-22

This is a dated operational snapshot, not a certification or a permanent statement of provider configuration. Re-check provider settings before each production release.

## Verified application and release controls

- Production host: https://medlumhealth.com
- Current verified production commit at audit time: `4773fa76e24cb80261eea96b09a04e740f569bf4`.
- Live read-only smoke checks passed at that commit: `/api/health` returned `status: ok`; `/login` was reachable; an unauthenticated request to `/api/patients` returned HTTP 401.
- Node 24 is declared in `package.json`, `.nvmrc`, the Docker base image and CI. The Node 24 PR passed MedLum CI and full-history secret scanning.
- Full-history Gitleaks scan is enabled for pull requests, main pushes, weekly execution and manual dispatch. Its current configuration allowlists only the four reviewed legacy localStorage namespace identifiers, not an entire source file.
- External clinical-AI processing is fail-closed unless explicitly opted in. Do not enable external processing for real patient data until facility consent/admin controls, provider terms/retention, regional transfers and applicable clinical/legal requirements are approved.
- Tariff Excel import uses the official SheetJS 0.20.3 tarball and rejects invalid/oversized base64/workbooks and worksheet dimensions above the configured limits.
- The Vercel build pipeline now runs `npm run build` only. It does not run Prisma migrations as a side effect. The first production build for this change completed successfully and its build logs contain no Prisma migration invocation.

## Controlled production migration workflow

The manual GitHub Actions workflow `Production Database Migrations` is deliberately fail-closed. Before using it, a repository administrator must configure the GitHub Actions environment `production-migrations` with:
1. Required reviewer(s) and branch restrictions.
2. Environment secret `PRODUCTION_DATABASE_URL` pointing to the existing production Neon database.
3. Environment variable `PRODUCTION_MIGRATIONS_ENABLED=true`.

The default workflow operation is read-only `status`. Applying migrations requires choosing `deploy` and entering `APPLY_PRODUCTION_MIGRATIONS`. It does not run automatically during a normal Vercel deployment. No production migration was executed as part of this release. Never test this workflow against production until those environment gates, migration SQL review, a verified recovery path and a compatible release plan are in place.

## Provider settings observed during this audit

### Neon PostgreSQL

- The connected project is on the Neon Free plan and the observed project setting reported a six-hour history/PITR window (`21600` seconds).
- The branch's automatic snapshot schedule was empty at audit time. Neon's current documentation says Free-plan PITR is limited to six hours / 1 GB of change history, and scheduled backup snapshots are not available on Free. See [Neon plan documentation](https://neon.com/docs/introduction/plans) and [Neon history-window documentation](https://neon.com/docs/postgres/backup-restore/history-window).
- The project's Neon HIPAA configuration flag was `false` at audit time. No BAA status was verified. Do not represent this setup as HIPAA-enabled or compliant. If the intended use requires HIPAA-regulated handling, confirm an eligible plan, signed BAA, configuration and service scope with the provider before processing such data.
- A one-off manual snapshot named `MEDLUM-RESTORE-DRILL-2026-10-22` was created for a restore rehearsal and was configured to expire at **2026-10-23 00:00 UTC**. This is temporary protection, not an ongoing backup policy.
- The restore rehearsal completed as a Neon branch cutover. The new default production branch was restored from the snapshot created approximately seven seconds before the operation. A prior branch was retained as a fallback. The health endpoint remained healthy.
- A read-only comparison of the restored production branch and fallback found 48 public base tables on both branches, 32 completed Prisma migrations and the same latest migration timestamp. A deterministic JSON row-serialization digest was computed separately for every table; **all 48 row counts and digests matched**, including clinical, billing, medication, document metadata/binary-storage tables and `_prisma_migrations`. No row-content mismatch was detected. Neon restore metadata reports a parent timestamp of `2026-10-21T19:29:12Z` while the manual snapshot was created at `19:29:31Z`; keep the pre-restore fallback until the owner signs off on the recovery point. The digest check is strong logical consistency evidence, but it does not validate external R2/object-storage objects or constitute an independent off-provider backup.

### Vercel region

- Production Vercel functions remain in `iad1`; the connected Neon database is in Singapore (`aws-ap-southeast-1`).
- PR #194 remains a draft/on hold. The connected Vercel team is on Hobby, and Vercel's published `sin1` regional pricing documentation says that region-specific pricing is available only on Pro: [Singapore region pricing](https://vercel.com/docs/pricing/regional-pricing/sin1). Do not merge the region change or upgrade the plan without the owner's plan/cost decision.

## Remaining release blockers

1. **Durable independent backups and recovery:** choose either a paid Neon plan with an appropriate PITR window and automated snapshot schedule, or a secure independent backup mechanism (for example, encrypted PostgreSQL custom-format dumps to private external storage, with access controls and retention). Do not store database dumps or patient records in GitHub artifacts/source control as a shortcut.
2. **Perform and record an isolated full restore drill:** restore a backup into a non-production target; verify schema and Prisma migration history; compare critical table row counts; verify application reads against synthetic/approved test data; verify required document/object-store binaries separately; preserve the production database untouched. Record elapsed recovery time and recovery-point age. The branch cutover rehearsal described above does not replace this.
3. **Finish migration workflow setup:** configure the protected `production-migrations` environment and verify a `status` run only after review. Do not enable migration application on unreviewed branches or use it against production as a CI smoke test.
4. **Resolve the Vercel region cost/plan decision:** retain `iad1` unless Pro eligibility and Singapore regional charges are approved.
5. **Complete clinical-AI governance:** keep external processing disabled until facility-level authorization/consent and provider/legal/clinical reviews are complete.
6. **Historical secret exposure review:** the current full-history scan is green with a narrow allowlist. A clean scan is not proof that no credential was ever exposed. Rotate/revoke any real credential if discovered and use an approved remediation process.
7. **Repository privacy and provider access:** verify GitHub repository visibility and authorized collaborator access in the GitHub UI; confirm Neon project permissions and production database credentials are appropriately scoped/managed. The current audit cannot certify every provider-side access policy.

## Go/no-go

**Status: Hardened application, not yet unrestricted production-ready for real clinical data.** The current deployment is live and passes the above read-only smoke checks. Remaining blockers are backup/restore resilience, owner setup for protected migrations, regional pricing decision, provider/consent governance for any external AI, and owner confirmation of provider access/privacy settings.

No production schema migration was applied as part of this audit.