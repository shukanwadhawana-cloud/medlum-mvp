# Catalyst staging — MedLum runtime notes

**Scope:** Zoho Catalyst Development only.  
**Canonical production:** Vercel `https://medlum-mvp.vercel.app/` — do not modify.

## Evidence (2026-10-16)

| Probe | Result |
|-------|--------|
| Preview `https://medlum-mvp-vsnppthd.onslate.in/api/health` | HTTP **500**, Zoho HTML error page |
| Executor `https://slate-…-dev.catalystappexecutor.in/api/health` | HTTP **500**, plain `Internal Server Error` |
| Same commit on Vercel `/api/health` | HTTP **200** `{"status":"ok",…}` |
| Catalyst build of `ec049f1` (PORT/ZC_SLATE_PORT binding) | Build **Success**; live still **500** |
| Deployment env vars | Empty |
| Auto-deploy | Disabled |
| Agent Catalyst API/CLI | **Not available** |

`/api/health` does not use Prisma. Missing `DATABASE_URL` is **not** a sufficient explanation for the universal 500.

## Root-cause assessment

1. **Port contract (high probability for executor 500):**  
   Official Zoho sample `catalystbyzoho/appsail-nextjs` starts Next with:
   ```bash
   next start -p ${X_ZOHO_CATALYST_LISTEN_PORT}
   ```
   Catalyst injects **`X_ZOHO_CATALYST_LISTEN_PORT`**, not only `PORT` / `ZC_SLATE_PORT`.  
   If the process listens on 3000 while the platform proxies another port, the executor returns **Internal Server Error**.

2. **Slate vs AppSail (platform fit):**  
   Zoho’s own Next.js sample README states they recommend **AppSail** (PaaS for standalone apps) for Next.js.  
   **Slate** is documented primarily as front-end hosting. Memory settings exist for Next.js on Slate, but full App Router + API routes + middleware may still be a poor fit if function mapping / long-lived process support is incomplete.

3. **PORT-only fix was insufficient:** Build `6707000000004026` of `ec049f1` (explicit `PORT`/`ZC_SLATE_PORT`) still returned 500 on both domains.

## Code on `fix/catalyst-staging-runtime`

```json
"start": "next start -H 0.0.0.0 -p ${X_ZOHO_CATALYST_LISTEN_PORT:-${PORT:-${ZC_SLATE_PORT:-3000}}}"
```

- Prefer Zoho’s listen port when present.
- Fall back to `PORT` (Render/Docker) then `ZC_SLATE_PORT` then `3000`.
- Vercel does **not** use `npm start` → production path unchanged.

## Human action required (Catalyst console)

No authorized Catalyst connector/CLI exists in this agent environment. Auto-deploy is off.

1. Redeploy **medlum-staging-dev** from branch **`fix/catalyst-staging-runtime`** (commit with `X_ZOHO_CATALYST_LISTEN_PORT` in `start`).
2. Set **Start command** to **`npm start`** (not `npm run dev`).
3. Confirm memory ≥ 1024 MB for Next.js.
4. Smoke:  
   `curl -sS https://medlum-mvp-vsnppthd.onslate.in/api/health`  
   Expect HTTP 200 and `"status":"ok"` **without** requiring `DATABASE_URL`.
5. If still 500, open **runtime logs** (not only build logs). If the process never binds or function mapping stays broken, treat **Slate as unsupported** for this full-stack Next 16 app and stage on **Vercel Preview** instead (still no production secrets).

## Safety

- Do not put production `DATABASE_URL`, `SESSION_SECRET`, R2 keys, or patient data on Catalyst.
- Do not merge this branch to `main` solely for staging experiments.
- Do not change Vercel production for this recovery.
