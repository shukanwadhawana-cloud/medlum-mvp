# MedLum MVP

Multi-doctor clinical platform — Phase 12 packaging and cross-device deployment.

## Production

**Live application:** https://medlum-mvp.onrender.com/

MedLum's production web deployment is hosted on **Render**. The packaged desktop and mobile clients are intended to connect to the same production application/backend rather than a separate Vercel deployment.

## Architecture

```
Browser / Mobile / Desktop → Render production app → /api/* (Next.js) → Prisma → PostgreSQL (Neon or any)
```

- Auth: bcrypt + HTTP-only JWT session cookie
- Isolation: server derives `doctorId` from session only
- No localStorage for production clinical data
- Video consultation: replaceable provider layer with Jitsi as the current default
- PWA: responsive phone/tablet/desktop web experience
- Packaging: Android/iOS mobile clients and Windows/macOS/Linux desktop clients

## Setup

```bash
cp .env.example .env
# Set DATABASE_URL and SESSION_SECRET

npm install
npx prisma db push
npm run dev
```

## Env vars (never commit real values)

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — long random string
- `VIDEO_PROVIDER` — video provider selection (`jitsi` by default)
- `VIDEO_BASE_URL` — video provider base URL
- `MEDLUM_APP_URL` — production application URL used by desktop packaging workflows

## Verify isolation

1. Sign up Doctor A → add patient / appt / rx / invoice
2. Logout → Sign up Doctor B
3. Confirm Doctor B cannot see Doctor A data

## Deployment

Render is the canonical production deployment for this repository. Vercel is not the production target.

[Open MedLum production on Render](https://medlum-mvp.onrender.com/)

## Runner diagnostic

This harmless marker is used to verify that GitHub-hosted Actions can execute a public-repository workflow independently of private-repository billing configuration.
