# CI forensic audit — MedLum CI runs ~232–275

Audit date: 2026-09-12  
HEAD at audit close: see latest main after desktop packaging fix.

## Current status (before this doc’s companion fix)

| Gate | Status |
|------|--------|
| MedLum CI (ci.yml) | **Green** at `e8296283` (run #275) |
| Production pilot validation | **Green** at `e8296283` (run #69) |
| Mobile packaging | **Green** (uses `npm install`, no lockfile required) |
| Desktop packaging | **Failed** on `npm ci` + `cache: npm` without `package-lock.json` |
| Render production | **Up** — `https://medlum-mvp.onrender.com/` returns 200; `/api/auth/me` 401 unauthenticated |

## Failure categories (232–263 and nearby)

### A. Real application / TypeScript defects (fixed by later commits)

| Runs | Root cause | Resolution |
|------|------------|------------|
| 256–262 | Compressed / broken JSX in `appointments/page.tsx` (TS1381) | `aba39529` repair JSX + format |
| 271 | `diagnostic-catalog.ts` TS2554 wrong arity on catalog helper | `26a6455c` / subsequent catalog fixes |

### B. Brittle / literal verifiers (fixed by aligning tests, not weakening product)

| Runs | Topic | Resolution |
|------|-------|------------|
| 246–255 | OPD/IPD care markers, consultant appointment, status, 409, clinic membership | Verifiers updated to match real contracts; care-setting explicit on PR branch |
| 264–268 | Production-security expected old origin-check strings | Middleware kept **proxy-aware** (`getExpectedOrigin` + x-forwarded-*); verifier aligned |

### C. CI infrastructure (not product bugs)

| Runs | Topic | Status |
|------|-------|--------|
| 251 | Stale checkout | Fixed: `ref: ${{ github.sha }}` in ci.yml |
| Desktop packaging | `npm ci` requires lockfile | **Fixed in this commit**: `npm install --include=dev --ignore-scripts` |

### D. Production pilot (Render)

| Runs | Topic | Resolution |
|------|-------|------------|
| 66–68 | Missing/incorrect `x-frame-options` in smoke headers | `e8296283` align production smoke security headers — pilot **green** |

## What was NOT a reason to change product code

- Historical Vercel-only deployment limits
- npm audit high severity advisory noise (do not `npm audit --force`)
- Desktop Tauri **build** still needs repo variable `MEDLUM_APP_URL` set — verify job no longer fails on lockfile; full installer build remains gated on that variable

## Render readiness

- `render.yaml` present
- Production URL responds
- Security headers present on login response
- Canonical validation path: GitHub → MedLum CI → Render deploy → production-pilot workflow

## Policy preserved

- Meaningful security and pilot gates retained
- No major dependency upgrades
- Proxy-aware origin middleware retained (not reverted to brittle exact-origin-only)
