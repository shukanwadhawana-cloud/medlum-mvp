# Production redeploy marker

**Triggered:** 2026-09-24T18:20Z (force #2)

## Why this commit exists

Forces a fresh production deploy on:
- **Vercel** (Git integration + production target) — previous production was stuck on `53475efe`
- **Render** (`render.yaml` autoDeploy: true)

## Included on main (must be live after this deploy)

- MedLum Duty (`/duty`) — geofenced punch-in/out, admin mark, optional Saniddhi outbound
- Prisma: `DutyAttendanceEvent` + Clinic geofence fields migration `20260924230000_medlum_duty_attendance`
- IPD: MLC placeholder `(if applicable)`, P2-05 handover label, failed-save aria-live handling
- CI green (otp.ts, writeAudit entity, MAR PATCH)

## Ops checklist after deploy

1. Vercel production build **READY** on this commit SHA (not `53475efe`)
2. Run **Prisma Migrate Deploy (Production)** with `confirm: migrate-deploy` so Duty tables apply
3. Render service `medlum-mvp` redeploys from `main`
4. Smoke: open `/duty`, `/ipd`, `/api/health`

## Production URLs

- Vercel: https://medlum-mvp.vercel.app
- Render: configured via `MEDLUM_APP_URL` / Render dashboard
