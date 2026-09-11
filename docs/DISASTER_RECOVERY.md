# MedLum Disaster Recovery

## Purpose

This document describes how to recover the current MedLum application if the Vercel deployment becomes unavailable or the hosting project must be recreated.

## Source of truth

- **Application source code:** GitHub repository `shukanwadhawana-cloud/medlum-mvp`
- **Production data:** Neon PostgreSQL
- **Hosting:** Vercel (replaceable)

The Vercel deployment is not the permanent storage location for MedLum data.

## Current architecture

```text
Doctor
  ↓
MedLum web application (Vercel)
  ↓
MedLum server API
  ↓
Neon PostgreSQL
```

### Data stored in Neon

Production PostgreSQL contains the persistent MedLum records represented by the Prisma schema, including:

- Doctor accounts
- Patients
- Appointments
- Prescriptions
- Invoices
- Encounters / consultations
- Audit logs

Clinical information such as consultation notes, diagnosis, assessment, plan, vitals, follow-up dates, and encounter-linked prescriptions is persisted through the application APIs into PostgreSQL.

## Authentication persistence

MedLum uses its application authentication system rather than Neon Auth:

- Passwords are stored as bcrypt hashes.
- Authenticated sessions use an HTTP-only cookie containing the signed session token.
- Server APIs derive `doctorId` from the authenticated session.
- Client-supplied doctor ownership is not trusted.

The browser session cookie itself is temporary. The Doctor account and its application records are persistent database records. Logging in again retrieves the account's data from Neon.

## Vercel failure recovery

If the current Vercel deployment returns 404 or otherwise becomes unusable:

1. Keep the GitHub repository unchanged.
2. Create a new Vercel project from `shukanwadhawana-cloud/medlum-mvp`.
3. Use the repository's production branch.
4. Configure the required production environment variables:
   - `DATABASE_URL=<existing Neon production connection string>`
   - `SESSION_SECRET=<existing production session secret>`
5. Use the repository's existing build configuration. The current build is application build only (`prisma generate && next build`).
6. Deploy.
7. Verify the application can log in and read the existing records.

**Critical:** the new Vercel project must point to the **existing Neon production database**. Do not create a new empty Neon database during hosting recovery.

## What a Vercel rebuild does and does not do

A Vercel redeployment rebuilds and hosts application code. It does not inherently recreate the production database.

The existing production database remains in Neon as long as its Neon project/database is retained.

A fresh Vercel project can therefore use the same Neon database by supplying the same `DATABASE_URL` and compatible `SESSION_SECRET`.

## Database schema safety

The application build must not run `prisma db push` automatically on every Vercel deployment.

Current intended build behavior:

```text
prisma generate && next build
```

Schema changes must be handled deliberately. Never use `prisma migrate reset`, database reset commands, or destructive SQL against production.

The Phase C.1 production verification documented that the Encounter schema change was additive and that the Neon schema was synchronized without resetting existing data.

## Database backup strategy

A production database backup is an additional safety layer beyond GitHub and Neon.

Do **not** commit PostgreSQL dumps to this Git repository. A database dump can contain sensitive clinical information and credentials/configuration must never be exposed in source control.

Before introducing an automated backup workflow, verify the chosen storage and retention mechanism. A GitHub Actions artifact is not a substitute for an independent long-term backup unless its retention and retrieval guarantees are acceptable for the intended use.

For a manual backup, use a trusted PostgreSQL client/environment with the production `DATABASE_URL` stored securely and create a PostgreSQL custom-format dump, for example:

```bash
pg_dump --format=custom --no-owner --file=medlum-production-YYYY-MM-DD.dump "$DATABASE_URL"
```

Keep the resulting dump in a secure private location. Never paste the database URL into chat, issues, logs, or source files.

If a future automated backup workflow is added, it should use GitHub Secrets, avoid printing secrets, and store backups outside the Git repository.

## Restore strategy

Restoration is potentially destructive and must never be performed casually against production.

Before restoring:

1. Confirm the backup file and date.
2. Confirm the target Neon database.
3. Stop or restrict application writes if necessary.
4. Take a fresh backup of the current production state if possible.
5. Review the restore command carefully.
6. Restore only with explicit confirmation that the intended data replacement is acceptable.

A typical PostgreSQL custom-format restore uses `pg_restore`, but the exact command depends on whether the target is empty, partially populated, or being replaced. Do not blindly run a restore command against the live MedLum database.

## Secret handling

Never commit:

- `DATABASE_URL`
- `SESSION_SECRET`
- database passwords
- API keys
- production database dumps containing patient data

Use:

- **Vercel Environment Variables** for production runtime secrets.
- **GitHub Secrets** for CI/CD workflows that genuinely need a secret.
- **Local `.env`** for local development only; keep it untracked.

`.env.example` must contain placeholders only.

## Recovery scenarios

### Scenario 1 — Vercel deployment returns 404

Redeploy the existing GitHub repository through Vercel. Confirm the required environment variables are present. The Neon database is not recreated.

### Scenario 2 — Vercel project is accidentally deleted

Create a new Vercel project from the same GitHub repository and configure the same production `DATABASE_URL` and `SESSION_SECRET`. Deploy and verify login/data retrieval.

### Scenario 3 — Code deployment is broken

Use GitHub to identify the last known-good commit and redeploy that commit/branch. Do not modify the database simply because an application deployment failed.

### Scenario 4 — Database problem

Do not reset or recreate production automatically. Preserve the current state, investigate Neon, and use a verified backup/restore procedure only when necessary.

## Recovery verification checklist

After recovering hosting, verify:

- Login works with an existing MedLum account.
- Existing patients are visible.
- Existing consultations/encounters are visible.
- Existing prescriptions are visible.
- Existing appointments are visible.
- Existing billing records are visible.
- A new test record can be created and retrieved.
- Doctor-to-doctor isolation still works.
- Logout/login still preserves data.

## Current safety principle

```text
GitHub = recoverable application code
Neon   = persistent production data
Vercel = replaceable hosting
```

This separation is intentional. A hosting failure should not require rebuilding the application or recreating the production database.
