# MedLum Production Safety Checklist

Use this checklist before major changes to the production application.

## Before coding

- Confirm the current production GitHub commit and Vercel deployment.
- Confirm the Neon database is the intended production database.
- Never copy production secrets into source code, issues, or documentation.
- Never use destructive database reset commands against production.
- For schema changes, inspect the exact SQL in the proposed Prisma migration and classify whether it is backward-compatible, additive, and safe for the current application version.

## During implementation

- Derive doctor ownership from the authenticated server session.
- Preserve existing data models unless an additive change is required.
- Vercel's `vercel-build` must compile the application only. It must not run `prisma migrate deploy`, `prisma db push`, or other schema mutation commands.
- Production Prisma migrations run only through the manually dispatched `Production Database Migrations` GitHub Actions workflow.
- Avoid unnecessary dependencies and infrastructure.

## Required setup for production migrations

Before the migration workflow can run, a repository administrator must configure the GitHub Actions environment named `production-migrations`:

1. Add `PRODUCTION_DATABASE_URL` as an environment secret. It must target the existing production Neon database; do not paste it into logs, chat, or source.
2. Add the environment variable `PRODUCTION_MIGRATIONS_ENABLED=true`.
3. Require at least one designated reviewer for deployments to this environment and restrict permitted deployment branches as tightly as the release process allows.
4. Review the migration SQL and the exact commit before approving any workflow run.

The workflow intentionally fails closed when the environment variable or database secret is absent. Its default operation is `status`, which inspects migration state without applying schema changes. Applying migrations requires selecting `deploy` and typing the exact confirmation `APPLY_PRODUCTION_MIGRATIONS`. The run is serialized so two migration jobs cannot execute concurrently.

## Safe release sequence for a schema change

1. Create a release branch named `release/<change>` from the current main branch and add only the reviewed migration and compatible code.
2. Open a PR and require CI, migration SQL review, and approval before applying production schema changes.
3. Select that exact reviewed `release/<change>` branch in GitHub Actions and run `Production Database Migrations` with operation `status`.
4. Confirm the intended database and migration state. Then run operation `deploy` with the exact confirmation. Review both the `migrate deploy` and post-apply `migrate status` output.
5. Merge the reviewed release branch to `main` only after the required checks pass; then verify the Vercel deployment and the affected workflows.
6. Prefer expand/contract changes: add compatible schema first, deploy code that works with old and new schema, backfill separately, and remove old schema only in a later reviewed release after it is no longer used.

Do not use a schema-changing PR as a reason to run an unreviewed migration against production. The manual workflow is not a substitute for migration SQL review, a verified backup, or a rollback/forward-fix plan.

## Before deployment

- Run the strongest available type/build/Prisma checks.
- Inspect the final diff for accidental changes.
- Confirm no secrets are staged.
- Verify the commit exists on the intended branch.
- Verify the migration state is compatible with the application version being deployed.

## After deployment

- Verify the production health endpoint and exact deployed Git SHA.
- Open the production app and use an authorized synthetic/test account.
- Verify an existing test patient and consultation using approved non-production data wherever possible.
- Verify prescription, appointment, and billing workflows in a safe test facility.
- Log out and back in to verify persistence.
- Verify tenant isolation if the change affects access control.

## Recovery principle

If Vercel fails, recover the application from GitHub and reconnect it to the existing Neon database. Do not create a replacement database unless the database itself is confirmed lost and a deliberate recovery procedure has been chosen. Reverting application code does not automatically roll back a database migration. Use a reviewed forward-fix or explicit database recovery plan after confirming the actual schema state.
