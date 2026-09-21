# MedLum Production Pipeline Clearance Status

**Date:** 2026-09-21  
**HEAD context:** post-PCS (`0fa5932`) + ABDM schema reconcile (`c38302c`) + CI verifier alignment (this pass)  
**Canonical production:** Render — https://medlum-mvp.onrender.com/  
**Secondary:** Vercel (verify-only)

---

## Root cause (build failure on PCS/ABDM commits)

**Prisma schema vs migration mismatch for ABDM/EKA** — fixed in `c38302c`.

- Migration `20260921020000_abdm_eka_mvp` added Clinic EKA fields, Patient ABHA fields, `AbdmConsent`, `AbdmCareContext`, `AbdmEvent`.
- Application code already used those Prisma delegates.
- `schema.prisma` lacked the models → `prisma generate` client incomplete → TypeScript / Next build failure on Render/Docker.

**Fix:** additive schema fields/models matching the existing migration. No migration rewrite. No DB reset.

---

## CI gate failures fixed this pass

Static verifiers that would fail CI after ABDM schema addition:

1. **`verify-data-retention-protection`** — allowed intentional CASCADE for:
   - `TelegramIdentity`, `TelegramLinkChallenge` (link state)
   - `AbdmConsent`, `AbdmCareContext`, `AbdmEvent` (clinic-scoped ABDM operational state; matches migration FK policy)
2. **`verify-api-auth-coverage`** — special-cased:
   - `auth/telegram/prelink/route.ts` (email+password ownership, no session)
   - `telegram/webhook/route.ts` (Telegram secret-token auth)

Verified locally: both scripts exit 0. EKA, hospital-foundation, tenant-isolation, portal-auth, OTP, RBAC static scripts also pass.

---

## Three-way consistency (code)

| Layer | Status |
|-------|--------|
| `schema.prisma` | ABDM models/fields present |
| Migration `20260921020000_abdm_eka_mvp` | Unchanged; SQL matches schema |
| Application code | Type-consistent with schema |
| Neon production | Applied on next successful Render start (`prisma migrate deploy`) — **no force-reset** |

---

## Deployment topology

| Platform | Role |
|----------|------|
| **Render** | **Canonical production** (`render.yaml` Docker, `migrate deploy && npm start`) |
| Vercel | Secondary verify workflow only |

Production smoke (current live image): `/api/health` → 200; `/login` → 200; `/api/patients` unauthenticated → 401.

---

## Environment variables (no values)

| Variable | Classification |
|----------|----------------|
| DATABASE_URL | REQUIRED runtime + migrate |
| SESSION_SECRET | REQUIRED runtime |
| MEDLUM_APP_URL | REQUIRED for links/packaging |
| TELEGRAM_BOT_TOKEN / USERNAME / WEBHOOK_SECRET | OPTIONAL (console OTP fallback) |
| EKA_* | OPTIONAL; live ABDM **BLOCKED BY EXTERNAL CREDENTIALS** if absent |

---

## Status classification

| Capability | Status |
|------------|--------|
| Prisma schema ↔ ABDM migration | **IMPLEMENTED — LOCAL VERIFIED** |
| Static CI verifiers (retention, auth coverage, EKA, foundation, tenant) | **IMPLEMENTED — LOCAL VERIFIED** |
| GitHub CI full green (typecheck + build) | Pending next CI run on main |
| Render Live deploy of reconciled HEAD | Pending platform rebuild after push |
| Neon ABDM tables | Applied when migrate deploy runs on successful start |
| EKA/ABDM live E2E | **PARTIALLY IMPLEMENTED — EXTERNAL DEPENDENCY REMAINS** |
| Full pilot E2E on production | Not claimed **PRODUCTION E2E VERIFIED** until post-deploy operator smoke + dual-tenant test |

---

## Operator checklist after this push

1. Confirm GitHub Actions **MedLum CI** green on the new commit.
2. Confirm Render deploy of that commit is **Live**.
3. Confirm no Prisma P2021/P2022 in Render logs after `migrate deploy`.
4. Run dual-hospital isolation on production DB.
5. Telegram OTP live path if bot token configured.
6. EKA sandbox only when EKA_* present.

Architecture remains frozen. No secrets committed. No destructive database operations.
