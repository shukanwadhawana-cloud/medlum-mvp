# Hospital data migration architecture

## Status (current main)

MedLum already ships a **production-safe, facility-scoped patient demographics** path:

| Surface | Path | Mutates |
|---------|------|---------|
| Export | `GET /api/facility-data/export` | No |
| Preflight | `POST /api/facility-data/import/preview` | No |
| Commit | `POST /api/facility-data/import/commit` | Yes (transaction) |
| Owner UI | `/owner/facility-data` | Client only |

Authorization: authenticated session + active clinic membership + **Owner or Admin** only.
Destination facility is **always** `membership.clinicId`. Client `clinicId` / `facilityId` / `ownerId` are ignored.
Secrets (passwords, session tokens, API keys, storage keys) are never exported or imported.
Duplicates and conflicts never overwrite existing clinical rows.

Issue #62 full-hospital onboarding remains **staged**. This document freezes the architecture so future work does not pipe multi-GB datasets through a single Vercel request.

## Two data planes

### 1. Structured data (PostgreSQL / Neon)

Patients, memberships, encounters, appointments, clinical notes, billing rows, etc.

- Source of truth: Neon
- Backup: provider PITR + optional operator `pg_dump` (see `docs/DISASTER_RECOVERY.md`)
- Migration: batch packages with schema version, facility identity, deterministic IDs/mapping reports

### 2. Object / document data

Clinical files, images, PDFs, attachments (`MedicalDocument.storageKey`).

- Source of truth: object storage when `STORAGE_PROVIDER=r2`
- On serverless without R2, `processed` storage is **not durable** for file bytes (structured rows still live in Neon)
- Migration of objects is **separate** from JSON clinical packages: copy-by-key or signed transfer with facility-prefixed keys (`buildStorageKey`)

## Hard limits

- Browser/API JSON packages are for **bounded** onboarding batches (server `MAX_IMPORT_BATCH`), not entire multi-year hospitals.
- Multi-GB migrations require: migration **manifest**, **chunk** files, **checkpoints**, resumable jobs, and background workers — not one HTTP body.
- Never equate “JSON download worked” with “hospital is fully migrated.”

## Owner invariant

- MedLum Master Owner is platform-level and is **never** imported from a package.
- Facility Owner/Admin roles may run export/import for their membership facility only.
- Imported users must not escalate to Master Owner via role text.

## Roadmap (not claimed implemented)

1. Expand structured entity coverage entity-by-entity with the same security boundary.
2. Manifest + chunked job model for large imports.
3. Object-plane copy with integrity checks against R2.
4. Isolated restore drills for DB + object planes without touching production.

Until those land, use the demographics path for controlled facility onboarding only.
