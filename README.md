# MedLum MVP

Multi-doctor clinical platform — Phase 12 packaging and cross-device deployment.

## Production

**Live application:** https://medlum-mvp.vercel.app/

MedLum's production web deployment is hosted on **Vercel**. The packaged desktop and mobile clients should connect to this production application/backend.

> **Note:** An older Render deployment at https://medlum-mvp.onrender.com/ may still respond but is **not** kept in sync with `main` and must not be treated as production.

## Architecture

```
Browser / Mobile / Desktop → Vercel production app → /api/* (Next.js) → Prisma → PostgreSQL (Neon or any)
```

- Auth: bcrypt + HTTP-only JWT session cookie
- Isolation: server derives `doctorId` from session only
- No localStorage for production clinical data
- Video consultation: replaceable provider layer with Jitsi as the current default
- PWA: responsive phone/tablet/desktop web experience
- Packaging: Android/iOS mobile clients and Windows/macOS/Linux desktop clients
- Clinical Assist OCR: on-device (pdfjs + Tesseract); no hosted Railway OCR dependency

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
- `MEDLUM_APP_URL` — production application URL used by desktop packaging workflows (use the Vercel production URL)

## Verify isolation

1. Sign up Doctor A → add patient / appt / rx / invoice
2. Logout → Sign up Doctor B
3. Confirm Doctor B cannot see Doctor A data

## Deployment

**Vercel is the canonical production deployment** for this repository. CI deploys and verifies production against Vercel on every push to `main`. Confirm the live SHA via `GET /api/health` (`gitSha` must match `main`).

[Open MedLum production on Vercel](https://medlum-mvp.vercel.app/)

## Runner diagnostic

This harmless marker is used to verify that GitHub-hosted Actions can execute a public-repository workflow independently of private-repository billing configuration.

Record lifecycle: clinical records require explicit confirmation; drafts may be deleted on cancellation, while submitted/final records are cancelled with an auditable retained state.

<!-- Deployment verification remains tied to the exact main commit SHA. -->
