# Phase C.1 — Production verification (2026-09-11)

## Schema
- Encounter model is additive (no destructive migrations).
- Prisma db push run #2 succeeded against Neon; existing data preserved.
- `package.json` build remains `prisma generate && next build` (no db push on Vercel build).

## Isolation (server session only)
All APIs use `getSession().doctorId`. Client-supplied doctorId is never trusted.

Production curl tests with Doctor A and Doctor B:
- A cannot GET B patient detail → 404
- A cannot POST encounter for B patient → 404 Patient not found
- B list patients returns only B records

## Workflow (production API)
Signup A → patient → encounter (vitals + diagnosis + follow-up) → Rx with encounterId → history shows encounter + Rx linked → logout → login → same data persists.

## Standalone regressions
Appointments POST and invoices POST still succeed for authenticated doctor.

## UI fix in this commit
Appointments list: **Start Consult** links to `/patients/{id}?appointmentId=...` (was missing on main).
