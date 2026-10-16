# Catalyst Slate staging — MedLum runtime checklist

**Scope:** Zoho Catalyst **Development** / Slate only.  
**Canonical production remains Vercel** (`https://medlum-mvp.vercel.app/`). Do not point Catalyst at production Neon or production secrets.

## Observed failure (2026-10-16)

| Check | Result |
|-------|--------|
| Catalyst build | Success (~4m) |
| Preview `https://medlum-mvp-vsnppthd.onslate.in/` | **HTTP 500** (Zoho generic HTML, not Next.js error page) |
| `/login` | **HTTP 500** |
| `/api/health` | **HTTP 500** |
| Deployment env vars | **None configured** |
| Originally deployed commit | `d2db6cdea504b4fa2e2a41c7fea529cadf3c5f2d` |
| Auto-deploy | **Disabled** — code fixes do not change the live preview until a human redeploys |

Because `/api/health` does **not** open Prisma or require `DATABASE_URL`, a missing database alone does **not** explain the universal 500. The Zoho-branded error body indicates the **platform proxy / process layer** is failing before a normal Next.js response is returned (process not listening, wrong start command/port, or process crash at boot).

Same application commit serves `/api/health` **200** on Vercel, so the app itself is runnable; the failure is host-specific to Catalyst Slate.

## What command does the runtime execute?

This repository **cannot** read the Catalyst console configuration via API (no Catalyst connector).

Inferred defaults from Catalyst docs + this app’s other hosts:

| Host | Start path |
|------|------------|
| **Vercel** | Platform serverless runtime — does **not** use `npm start` |
| **Render / Docker** | `Dockerfile` ends with `exec npm start` and sets `PORT=10000` |
| **Catalyst Slate** | Console “start command” (often auto-filled). Local docs show `npm run dev -- --port $ZC_SLATE_PORT` for Next.js — **wrong** after a production build |

**Do not assume** that adding a `start:slate` script changes runtime behavior. The platform only runs whatever **start command** is configured in the Slate deployment (commonly `npm start` or an auto-detected value).

## Code fix on `fix/catalyst-staging-runtime`

`package.json`:

```json
"start": "next start -H 0.0.0.0 -p ${PORT:-${ZC_SLATE_PORT:-3000}}"
```

Rationale:

- Next.js already documents default hostname `0.0.0.0` and port from `PORT`.
- Making this **explicit** ensures Catalyst’s injected `PORT` / `ZC_SLATE_PORT` is used even if defaults differ.
- **Render/Docker** already set `PORT` and call `npm start` — compatible.
- **Vercel** does not invoke `npm start` for this app — production path unchanged.

`start:slate` remains an alias of `npm start` for clarity in the console.

## Required Catalyst console settings (human)

| Setting | Recommended value |
|---------|-------------------|
| Git ref | Branch `fix/catalyst-staging-runtime` (or its latest commit) |
| Framework | Next.js |
| Node runtime | **20** or **22** |
| Root path | `./` |
| Install | `npm install` |
| Build | `npm run build` |
| Output path | `.next` |
| **Start command** | `npm start` (preferred) or `npm run start:slate` |
| Memory | 1024–2048 MB |

**Do not** use `npm run dev` as the remote start command after a production build.

## Staging-only environment variables

| Variable | For | Notes |
|----------|-----|-------|
| (none) | `/api/health` liveness | Health does not need DB or session |
| `SESSION_SECRET` | Login / session | ≥32 chars, **staging-only** |
| `DATABASE_URL` | Prisma routes | **Isolated staging DB only** |

## Verification after redeploy

```bash
curl -sS -w "%{http_code}\n" https://medlum-mvp-vsnppthd.onslate.in/api/health
# expect 200 and {"status":"ok",...}

curl -sS -o /dev/null -w "%{http_code}\n" https://medlum-mvp-vsnppthd.onslate.in/
curl -sS -o /dev/null -w "%{http_code}\n" https://medlum-mvp-vsnppthd.onslate.in/login
```

## Safety

- No production secrets, Neon URL, or patient data on Catalyst.
- No production migrations from Catalyst.
- Do not change Vercel production for this recovery.
