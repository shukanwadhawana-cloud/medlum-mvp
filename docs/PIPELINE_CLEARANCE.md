# MedLum Production Pipeline Clearance Status

**Date:** 2026-09-21 (pipeline clearance pass)
**Canonical production:** Render — https://medlum-mvp.onrender.com/
**Secondary:** Vercel (verify-only)

## Root causes addressed

### 1. Prisma schema vs ABDM migration (c38302c)
Migration `20260921020000_abdm_eka_mvp` added Clinic EKA / Patient ABHA fields and AbdmConsent, AbdmCareContext, AbdmEvent. Schema lacked models → incomplete Prisma client → build failure. Fix: additive schema matching migration. No migration rewrite. No DB reset.

### 2. Docker build missing DATABASE_URL for prisma generate (fc3818e)
`npm run build` = `prisma generate && next build`. Dockerfile previously had no DATABASE_URL at build time. CI used a placeholder; Docker did not. Fix: build-time placeholder ENV in Dockerfile; runtime uses platform secrets; CMD runs `prisma migrate deploy && npm start`.

### 3. CI static verifier alignment (16adae6)
Retention + API auth-coverage special-cases for Telegram and ABDM CASCADE/webhook routes.

## Three-way consistency

| Layer | Status |
|-------|--------|
| schema.prisma | ABDM models/fields present |
| Migration 20260921020000_abdm_eka_mvp | Unchanged; SQL matches schema |
| Application code | Uses prisma.abdmConsent / abdmCareContext / abdmEvent |
| Neon production | Applied via prisma migrate deploy on start (no force-reset) |

Static verifiers (local): data-retention PASSED, api-auth-coverage (62 routes) PASSED, hospital-foundation PASSED, tenant-isolation PASSED, eka (23 checks) PASSED.

## Production smoke (live Render — 2026-09-21)

| Check | Result |
|-------|--------|
| GET /api/health | 200 status ok version 0.2.1 |
| GET /login | 200 |
| GET /api/patients (unauth) | 401 |

## Environment (no values)

| Variable | Classification |
|----------|----------------|
| DATABASE_URL | REQUIRED runtime + migrate |
| SESSION_SECRET | REQUIRED runtime |
| MEDLUM_APP_URL | REQUIRED |
| TELEGRAM_* | OPTIONAL (console OTP fallback) |
| EKA_* | OPTIONAL; live ABDM PARTIALLY IMPLEMENTED — EXTERNAL DEPENDENCY REMAINS |

## Status classification

| Capability | Status |
|------------|--------|
| Prisma schema ↔ ABDM migration | IMPLEMENTED — LOCAL VERIFIED |
| Docker build env for prisma generate | IMPLEMENTED — LOCAL VERIFIED |
| Static CI verifiers | IMPLEMENTED — LOCAL VERIFIED |
| Production health / login / auth gate | IMPLEMENTED — PRODUCTION E2E VERIFIED (smoke) |
| Full pilot E2E + dual-tenant | Operator checklist remaining |
| EKA/ABDM live | PARTIALLY IMPLEMENTED — EXTERNAL DEPENDENCY REMAINS |

## Operator checklist

1. Confirm GitHub Actions MedLum CI green (typecheck + build + verifiers).
2. Confirm Render Live deploy of Docker-fix commit.
3. Confirm no Prisma P2021/P2022 after migrate deploy.
4. Dual-hospital isolation on production DB.
5. Telegram OTP live if bot configured.
6. EKA sandbox only when EKA_* present.

Architecture frozen. No secrets committed. No destructive DB operations.
