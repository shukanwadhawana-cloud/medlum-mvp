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
| Deployed commit | `d2db6cdea504b4fa2e2a41c7fea529cadf3c5f2d` |

Because `/api/health` does **not** open Prisma or require `DATABASE_URL`, a missing database alone does **not** explain the universal 500. The Zoho-branded error body indicates the **platform proxy / process layer** is failing before a normal Next.js response is returned (process not listening, wrong start command/port, or process crash at boot).

## Official Slate constraints (from Catalyst docs)

- Slate is primarily a **front-end deployment** product with Next.js listed as a supported framework.
- Local serve defaults document Next.js as: `npm run dev -- --port $ZC_SLATE_PORT`.
- **After** `npm run build`, production serving must use **`next start`**, not `next dev`.
- The process must bind the port Catalyst injects (`PORT` and/or `ZC_SLATE_PORT`).
- Prefer hostname `0.0.0.0` so the platform proxy can reach the process.

## Required Catalyst console settings

| Setting | Recommended value |
|---------|-------------------|
| Framework | Next.js |
| Node runtime | **20** or **22** (match deploy; Next 16.3.x needs modern Node) |
| Root path | `./` |
| Install | `npm install` (or `npm ci` if lockfile is committed) |
| Build | `npm run build` |
| Build / output path | `.next` |
| **Start command** | `npm run start:slate` (see `package.json`) |
| Memory | 1024–2048 MB for this app |

### Start command (critical)

```bash
npm run start:slate
```

This expands to production `next start` bound to `0.0.0.0` and `PORT` / `ZC_SLATE_PORT`.

**Do not** use `npm run dev` as the remote start command after a production build.

## Staging-only environment variables

Set these in Catalyst **Development** environment variables (never commit values):

| Variable | Required to | Notes |
|----------|-------------|-------|
| `SESSION_SECRET` | Boot auth/session paths in `NODE_ENV=production` | ≥32 chars, non-weak random; **staging-only** |
| `DATABASE_URL` | Any Prisma-backed route | **Isolated staging DB only** — never production Neon |
| `NODE_ENV` | Usually set by platform | If set, `production` enables strict session secret checks |
| `MEDLUM_OWNER_EMAIL` | Owner features | Optional on staging |
| `STORAGE_PROVIDER` | Document uploads | Prefer `processed` or staging R2; not production R2 credentials |

**Minimum for liveness:** platform must successfully run `next start` on the injected port.  
**Minimum for login smoke:** `SESSION_SECRET` + staging `DATABASE_URL`.

## Verification after redeploy

```bash
curl -sS -o /tmp/h.json -w "%{http_code}\n" https://<preview-host>/api/health
# expect 200 and {"status":"ok",...}

curl -sS -o /dev/null -w "%{http_code}\n" https://<preview-host>/
curl -sS -o /dev/null -w "%{http_code}\n" https://<preview-host>/login
```

If status remains Zoho HTML 500 with correct start command and env, open **Catalyst runtime logs** for the deployment (previously “not indexed”) and capture the Node process stderr.

## Incompatibility note

If Slate cannot keep a long-lived `next start` process reachable on the assigned port for Next.js 16 App Router (API routes + middleware), treat Catalyst as **unsupported for this full-stack app** and stage on **Vercel Preview** or another Node host instead. Do not weaken MedLum security to fit an incompatible host.

## Safety

- Do not use production `DATABASE_URL`, `SESSION_SECRET`, R2 keys, or patient data on Catalyst.
- Do not run production migrations from Catalyst.
- Do not change Vercel production as part of this staging recovery.
