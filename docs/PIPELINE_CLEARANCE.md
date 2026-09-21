# MedLum Production Pipeline Clearance Status

**Date:** 2026-09-21  
**HEAD at clearance start:** `0fa5932` (PCS patient lifecycle)  
**Clearance fix commit:** `c38302c` — reconcile ABDM Prisma schema with migration  
**Canonical production:** Render — https://medlum-mvp.onrender.com/  
**Secondary:** Vercel (verify-only; not canonical)

---

## Root cause of deploy/build failure (identified)

**Prisma schema vs migration mismatch for ABDM/EKA.**

- Migration `prisma/migrations/20260921020000_abdm_eka_mvp/migration.sql` adds:
  - Clinic: `ekaHipId`, `ekaHipCode`, `ekaOnboardedAt`
  - Patient: `abhaNumber`, `abhaAddress`, `abhaStatus`, `abhaTxnId`, `abhaLinkedAt`, `abhaVerifiedAt`
  - Tables: `AbdmConsent`, `AbdmCareContext`, `AbdmEvent`
- Application code (`src/app/api/interoperability/eka/*`, `src/lib/interoperability/abdm-tenant.ts`) uses `prisma.abdmConsent`, `prisma.abdmCareContext`, `prisma.abdmEvent`, `patient.abha*`, `clinic.ekaHip*`.
- **`prisma/schema.prisma` did not declare these models/fields.**

Effect:

1. `npx prisma generate` produced a client without ABDM types/delegates.
2. TypeScript typecheck failed (or would fail) on EKA routes.
3. Docker/Render build (`npm run build` = `prisma generate && next build`) could not complete successfully for ABDM-dependent commits.
4. Runtime would also fail with missing client delegates if an older client somehow shipped.

**Fix applied in `c38302c`:** schema.prisma reconciled to match the existing migration (additive fields + three models + relations/indexes). No migration rewrite. No destructive DB change.

Also removed unused `getActiveClinicId` import from patients route (lint/TS hygiene).

---

## Three-way consistency (code)

| Layer | Status after `c38302c` |
|-------|------------------------|
| `schema.prisma` | Includes Clinic EKA fields, Patient ABHA fields, AbdmConsent, AbdmCareContext, AbdmEvent |
| Migration `20260921020000_abdm_eka_mvp` | Unchanged; SQL matches schema |
| Application code | Already referenced those models; now type-consistent with schema |

**Neon production DB:** Not inspectable from this agent (no DATABASE_URL). Render start command is `npx prisma migrate deploy && npm start`, so on next successful deploy the pending ABDM migration will apply if not already present. **Do not** run migrate reset / force-reset.

---

## Deployment topology

| Platform | Role | Config |
|----------|------|--------|
| **Render** | **Canonical production** | `render.yaml` Docker service `medlum-mvp`, health `/api/health`, env: DATABASE_URL, SESSION_SECRET, MEDLUM_APP_URL (sync:false) |
| **Vercel** | Secondary / verify workflow | `vercel.json` framework nextjs; workflow only checks reachability of `medlum-mvp-doc-shukan.vercel.app` |
| **GitHub Actions CI** | Gate | Node 20, `prisma generate`, typecheck, many verify scripts, then `npm run build` |
| **Dockerfile** | Render build | node:20-bookworm-slim → npm ci → `npm run build` → start: `prisma migrate deploy && npm start` |

---

## Production smoke (live at audit time)

| Check | Result |
|-------|--------|
| `GET https://medlum-mvp.onrender.com/api/health` | **200** `{"status":"ok","service":"medlum","version":"0.2.1"}` |
| `GET /login` | **200** |
| `GET /api/patients` (unauthenticated) | **401** (expected) |

Live process was still an **older successful image** until Render rebuilds from `c38302c` (or later). PCS commit `0fa5932` alone was not confirmed live on Render before the schema fix.

---

## Environment variables (classification only — no values)

| Variable | Role |
|----------|------|
| DATABASE_URL | **REQUIRED** runtime + migrate deploy |
| SESSION_SECRET | **REQUIRED** runtime auth |
| MEDLUM_APP_URL | **REQUIRED** packaging / links |
| TELEGRAM_BOT_TOKEN | **OPTIONAL** runtime OTP delivery (console fallback if missing) |
| TELEGRAM_BOT_USERNAME / TELEGRAM_WEBHOOK_SECRET | **OPTIONAL** link/webhook |
| EKA_* (BASE_URL, CLIENT_ID, CLIENT_SECRET, API_KEY, PT_ID, HIP_ID) | **OPTIONAL**; ABDM live E2E **BLOCKED BY EXTERNAL CREDENTIALS** if absent |

Never commit secrets. Never print values.

---

## What was verified in this clearance pass

- Schema ↔ migration ↔ code alignment for ABDM (fix committed).
- Production health endpoint and auth gate still respond.
- Dockerfile + Render start path use `migrate deploy` (safe, non-destructive).
- Architecture frozen; no platform switch; no DB reset.

## What remains operator/CI-gated

1. **CI #626** (or subsequent) on `c38302c` must finish green (typecheck + build).
2. **Render auto-deploy** of `c38302c` must complete; confirm new deploy is Live.
3. After deploy: confirm `prisma migrate deploy` applied `20260921020000_abdm_eka_mvp` on Neon (no P2021/P2022).
4. Operator: dual-hospital tenant isolation on production DB.
5. Operator: Telegram OTP live path if bot token configured.
6. EKA live/sandbox E2E only when EKA_* secrets exist.

---

## Status classification (evidence-based)

| Capability | Status |
|------------|--------|
| Prisma schema ↔ ABDM migration | **IMPLEMENTED — LOCAL VERIFIED** (reconciled in `c38302c`) |
| CI build/typecheck after fix | **Pending CI run completion** |
| Render deploy of PCS + schema fix | **Pending platform rebuild** |
| Production health (pre-rebuild image) | **IMPLEMENTED — PRODUCTION** (older image healthy) |
| PCS patient discharge/search/UHID | **IMPLEMENTED — CI path pending** (code on main) |
| Neon ABDM tables | **Unknown until migrate deploy on prod** |
| EKA/ABDM live | **PARTIALLY IMPLEMENTED — EXTERNAL DEPENDENCY REMAINS** |
| Full E2E pilot acceptance | **Not claimed PRODUCTION E2E VERIFIED** until post-deploy smoke + isolation |

---

## Stop condition

Pipeline is **not yet fully green** until Render shows a Live deploy of `c38302c` (or later) with successful migrate deploy and no Prisma missing-relation errors. Code-side root cause of the schema/build break is fixed on `main`.
