# MedLum deployment: Render + GitHub + Neon

MedLum runs as a standard Next.js Node application on Render. The production database remains Neon and is not moved.

## Canonical production deployment

**Render:** https://medlum-mvp.onrender.com/

GitHub remains the source of truth and Render auto-deploys from `main`.

## Architecture

Browser → Render (Next.js/Node) → Prisma → Neon PostgreSQL

## Render setup

1. Create a Render account and choose **New → Blueprint**.
2. Connect GitHub and select `shukanwadhawana-cloud/medlum-mvp`.
3. Render detects `render.yaml`.
4. Set `DATABASE_URL` to the existing production Neon connection string.
5. Set `SESSION_SECRET` to the existing production session secret. Do not rotate it during the migration, otherwise existing sessions will be invalidated.
6. Create the service.

The repository already contains a production Dockerfile and Render blueprint. No Prisma schema migration is performed by deployment.

## Data safety

Neon remains the production database. Deploying the application to Render does not copy, reset, or replace the database.

Do not run `prisma db push` as part of normal application deployment. Database schema changes remain a separate controlled operation.

## Validation after first deployment

- Open `/login`.
- Sign in with an existing MedLum account.
- Confirm existing patients and longitudinal history are present.
- Create a test appointment/consultation only if needed.
- Confirm billing and payment history are still present.

## Vercel

Vercel may remain connected temporarily while Render is validated. Once Render production is confirmed, disable/remove the Vercel Git integration so future commits no longer trigger Vercel deployments.
