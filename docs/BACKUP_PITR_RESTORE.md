# MedLum Backup, PITR, Restore Drill & Monitoring

**Phase:** Remaining USA-readiness hardening — recovery before production data correction  
**Baseline main SHA at branch creation:** `5b8bbf9feb4ed99209f5fb79c39ed5c688bada13`  
**Related Phase A DR:** `docs/DISASTER_RECOVERY.md` (preserve; do not weaken)

This document distinguishes **IMPLEMENTED**, **CONFIGURED**, **REQUIRES EXTERNAL CONFIGURATION**, **VERIFIED**, and **NOT YET VERIFIED**.

---

## 1. What exists in the repository today

| Area | Status | Evidence |
|------|--------|----------|
| Neon as production database | **DOCUMENTED** | `docs/DISASTER_RECOVERY.md` |
| Manual `pg_dump` workflow | **IMPLEMENTED** (workflow) | `.github/workflows/neon-manual-backup.yml` |
| Backup artifact retention | **CONFIGURED** (7 days, GitHub Actions artifacts) | same workflow |
| Automated scheduled backups | **REQUIRES EXTERNAL CONFIGURATION** | Neon console / schedule or GitHub `schedule` not present |
| Neon Point-in-Time Recovery (PITR) | **REQUIRES EXTERNAL CONFIGURATION** | Neon project setting; not provisioned by this repo |
| Independent object storage (R2) | **IMPLEMENTED** (code path) | `src/lib/storage/r2.ts`, `getStorageProvider()` |
| Local storage fallback | **IMPLEMENTED** | `src/lib/storage/local.ts` (not durable on serverless) |
| Processed OCR blobs non-retained | **IMPLEMENTED** | `src/lib/storage/processed.ts` |
| Phase A DR CI gate | **IMPLEMENTED + VERIFIED in CI** | `scripts/verify-disaster-recovery-readiness.mjs` |
| Public `/api/health` | **IMPLEMENTED** | status only; no secrets/PHI |
| Isolated restore drill against non-prod | **PROCEDURE DOCUMENTED** (this file); **NOT YET VERIFIED** against a live isolated Neon branch |
| External monitoring alerts | **REQUIRES EXTERNAL CONFIGURATION** | Vercel/Neon/Uptime provider |

**Do not claim “backup complete” solely because documentation exists.**

---

## 2. Database backup strategy

### What is backed up

- PostgreSQL contents reachable via production `DATABASE_URL` (Neon).
- Application data modeled by Prisma (doctors, patients, encounters, clinical notes, invoices, audit events, memberships, etc.).

### What is not backed up by the application repo

- GitHub source code is recovered from GitHub, not from DB dumps.
- Vercel is replaceable hosting only.
- Object storage (R2) must be backed up/versioned independently of Postgres (see §6).

### How to take a manual backup (IMPLEMENTED workflow)

1. In GitHub Actions, run workflow **Manual Neon Database Backup** (`workflow_dispatch`).
2. Requires GitHub Secret `DATABASE_URL` (production or **isolated** read replica — never commit it).
3. Produces a PostgreSQL **custom-format** dump artifact: `medlum-YYYYMMDD-HHMMSS.dump`.
4. Artifact retention: **7 days** on GitHub Actions.

**Limitations (honest):**

- Not a continuous schedule in-repo (manual only unless Neon or Actions schedule is added externally).
- Artifacts live on GitHub’s artifact store — independent of Neon, but **not** a long-term archive (7 days).
- For long-term retention, export dumps to an access-restricted object store (R2/S3) with lifecycle policy **outside** this repository’s secrets.

### Automated / provider backups

| Mechanism | Status |
|-----------|--------|
| Neon automatic backups / snapshots | **REQUIRES EXTERNAL CONFIGURATION** — enable and confirm in Neon console |
| Neon PITR window | **REQUIRES EXTERNAL CONFIGURATION** — confirm plan supports PITR and note retention window |
| GitHub scheduled `pg_dump` | **NOT IMPLEMENTED** (optional follow-up; prefer Neon native backups for RPO) |

---

## 3. Point-in-time recovery (PITR)

| Item | Value |
|------|--------|
| Capability | Neon PITR when enabled on the project (provider feature) |
| Repo control | None — cannot be “coded”; must be confirmed in Neon |
| Prerequisites | Paid/supported Neon plan with PITR; project not deleted |
| Authorization | Platform owner / designated ops only; never casual |
| Production protection | Never restore **onto** production without explicit dual-check; prefer restore to **new** Neon branch/database |

**RPO (expected maximum data-loss window)**  
- **Target once Neon PITR is enabled:** minutes-to-hours depending on Neon plan (confirm in console).  
- **With manual dumps only:** up to time since last successful dump (could be days if no one runs the workflow).  
- **Status:** **NOT YET VERIFIED** for production Neon project from this agent session.

**RTO (expected recovery window)**  
- **Hosting-only failure (Vercel):** minutes–tens of minutes (redeploy + env). Documented in `DISASTER_RECOVERY.md`.  
- **Database restore to isolated target:** typically 30–120 minutes depending on dump size and validation.  
- **Status:** **PROCEDURE DOCUMENTED**; **NOT YET VERIFIED** end-to-end against production-sized data.

---

## 4. Backup independence

| Failure mode | Survives? |
|--------------|-----------|
| Vercel app down | Yes — data in Neon; code in GitHub |
| Neon primary unavailable | Only if independent backup/PITR exists (Neon snapshots or exported dumps) |
| Accidental app-level delete of rows | Needs dump/PITR from **before** the event |
| Accidental Neon project deletion | **Critical risk** — enable Neon protection / export dumps to R2; **REQUIRES EXTERNAL CONFIGURATION** |
| GitHub artifact expired (7d) | Dump gone unless copied elsewhere |

Access to dumps must remain restricted (GitHub org permissions + Neon roles). Never publish backup URLs.

---

## 5. Restore drill (MUST NOT overwrite production)

### Principles

1. Restore only to an **isolated** Neon branch/database or local Postgres.
2. Never point production Vercel `DATABASE_URL` at a half-restored target during a drill.
3. Prefer synthetic/minimal data when possible; if using a scrubbed production dump, treat it as PHI and delete after the drill.
4. Record who ran the drill, when, and the outcome (pass/fail) without writing PHI into tickets.

### Procedure outline

1. **Obtain backup** — download latest Actions artifact **or** create Neon branch from PITR timestamp **or** `pg_dump` from a non-prod source.
2. **Provision isolated target** — empty Neon database or local Postgres; separate credentials.
3. **Restore** — `pg_restore` into the isolated target (exact flags depend on empty vs existing schema; do not invent destructive flags against prod).
4. **Schema usability** — `prisma migrate status` / generate client against isolated URL only.
5. **Integrity checks (read-only):**
   - required tables present (Doctor, Patient, Clinic, ClinicMembership, Encounter, AuditEvent, …)
   - FK relationships intact (no orphan-heavy samples beyond known legacy null `clinicId`)
   - sample counts non-zero only if expected for that dump
6. **App connect** — run app against **isolated** `DATABASE_URL`; login with a **test** account if present.
7. **Facility isolation** — confirm membership scoping still enforced (static gates + optional smoke).
8. **Audit** — confirm AuditEvent rows readable if present in dump.
9. **Teardown** — destroy isolated database; purge local dumps securely.

### Acceptance gate (automated where practical)

`scripts/verify-backup-pitr-readiness.mjs` validates **repository readiness** (docs, workflow, no secrets, Phase A gate still present).  
It does **not** pretend a live restore succeeded.

`scripts/restore-drill-checklist.mjs` prints a machine-readable checklist and exits non-zero if required procedure files are missing. Live restore remains an ops action.

---

## 6. Storage recovery (clinical documents)

| Provider | Behavior |
|----------|----------|
| `STORAGE_PROVIDER=r2` | Durable object storage (Cloudflare R2); credentials via env only |
| `local` | Dev only; **not** durable on Vercel |
| `processed` | OCR processed content non-retained by design |

**Requirements (external):**

- Enable R2 versioning or separate backup bucket if document recovery is required after deletion.
- DB restore alone does not recreate deleted R2 objects.
- Never make clinical buckets public.

**Status:** Code path **IMPLEMENTED**; production R2 bucket backup policy **REQUIRES EXTERNAL CONFIGURATION / NOT YET VERIFIED**.

---

## 7. Backup integrity signals

Distinguish:

| Signal | Meaning |
|--------|---------|
| BACKUP_EXISTS | A dump artifact or Neon snapshot is listed |
| BACKUP_IS_RECOVERABLE | Isolated restore drill passed schema + connectivity + isolation checks |
| BACKUP_STALE | Last successful dump/snapshot older than policy (e.g. > 24h if daily policy) |
| BACKUP_MISSING | No recent dump and PITR not confirmed |
| RESTORE_TEST_FAILED | Last drill failed |

Repository CI can only enforce documentation + workflow presence + secret hygiene. Live freshness is **ops/monitoring**.

---

## 8. Monitoring / alert readiness

### Existing

- `GET /api/health` — `{ status, service, version, gitSha?, timestamp }` only. **No** DATABASE_URL, tokens, or PHI.

### Recommended external (REQUIRES EXTERNAL CONFIGURATION)

| Check | Suggested owner |
|-------|-----------------|
| HTTP 200 on `/api/health` | Uptime monitor |
| Neon availability / storage | Neon alerts |
| Backup age | Neon + optional scheduled dump job |
| Vercel deployment failures | Vercel notifications |
| OCR project rate limits | Separate from MVP; do not disable checks to hide limits |

### Failure states (actionable labels)

- `DATABASE_UNAVAILABLE`
- `STORAGE_UNAVAILABLE`
- `BACKUP_MISSING` / `BACKUP_STALE`
- `RESTORE_TEST_FAILED`
- `CRITICAL_JOB_FAILED`

Do not emit fake alerts from the app without a connected channel.

---

## 9. Authorization to restore

- **Initiate restore / PITR:** Platform Master Owner and designated infrastructure operators only.
- **Never** expose restore endpoints on the public MedLum API.
- **Never** put production dumps in the git tree.

---

## 10. Security rules (non-negotiable)

- No production credentials in the repository or `.env.example`.
- No unauthenticated backup download routes.
- No public clinical storage.
- Do not weaken Phase A DR gate or Phase B correction rules.
- Do not start production `clinicId` correction until recovery is proven.

---

## 11. CI linkage

- Existing: `npm run test:disaster-recovery-readiness` (Phase A).
- Added: `npm run test:backup-pitr-readiness` (this phase — docs/workflow/secret hygiene).
- Added: `npm run test:restore-drill-checklist` (procedure presence).

---

## 12. Explicit non-claims

As of this document’s introduction:

- Live production PITR window: **NOT YET VERIFIED** from this repository session.
- End-to-end isolated restore of production-sized dump: **NOT YET VERIFIED**.
- Long-term dump archive outside GitHub artifacts: **REQUIRES EXTERNAL CONFIGURATION**.
- Continuous backup freshness monitoring: **REQUIRES EXTERNAL CONFIGURATION**.

When those are verified, update this section with date, operator, and result (pass/fail) without embedding PHI.
