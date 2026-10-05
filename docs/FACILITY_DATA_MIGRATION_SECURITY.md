# Facility data migration / export / import security

## Purpose

Production-safe, facility-scoped export and import of hospital patient demographics for MedLum USA-readiness hardening. This does **not** redesign clinical workflows, tenancy, or RBAC.

## Security boundary

| Rule | Implementation |
|------|----------------|
| Authenticated session required | `getSession()` on every route |
| Facility scope | `requireActiveClinicMembership(session.doctorId)` — cookie is only a selector; DB membership is authoritative |
| Destination facility | Always `membership.clinicId`. Client `clinicId` / `facilityId` / `destinationClinicId` / `doctorId` / `ownerId` are ignored |
| Privileged roles | **Owner** and **Admin** only (`canPerformFacilityDataMigration`) |
| Clinical roles | Cannot export or import |
| Secrets | Never exported (no passwords, session tokens, API keys) |

## Endpoints

| Method | Path | Mutates? | Role |
|--------|------|----------|------|
| GET | `/api/facility-data/export` | No | Owner, Admin |
| POST | `/api/facility-data/import/preview` | **No** | Owner, Admin |
| POST | `/api/facility-data/import/commit` | Yes (transaction) | Owner, Admin |

Core helpers live in `src/lib/data/facility-migration.ts`.

## Export

- Loads patients where `clinicId = membership.clinicId` and `deletedAt` is null.
- Emits format `medlum-facility-export-v1` (demographics + UHID / registration / ABHA fields).
- Does not include passwords, portal credentials, or payment secrets.
- Writes audit action `FACILITY_DATA_EXPORT` with counts only (no PHI dump).

## Import preview

- Validates each record (name, age, gender, phone bounds).
- Matches existing facility patients by UHID, registration number, or phone+name+age.
- Decisions: `create` | `duplicate_match` | `conflict` | `invalid`.
- **Never writes** to the database.
- Audit: `FACILITY_DATA_IMPORT_PREVIEW` with `mutated: false`.

## Import commit

- Re-runs the same preview rules.
- Rejects the whole batch if any row is `invalid`.
- Creates only `create` rows inside `prisma.$transaction`.
- Assigns `clinicId: membership.clinicId` and `doctorId: membership.doctorId` only.
- Does **not** overwrite existing clinical records on duplicate match.
- On transaction failure: reports failure and keeps zero partial creates.
- Audit: `FACILITY_DATA_IMPORT_COMMIT` with counts only.

## Duplicate / conflict policy

1. Strong identifier match within the **same** facility → skip create (duplicate_match).
2. Malformed records → invalid; commit refused.
3. Batch size capped (`MAX_IMPORT_BATCH`) to bound risk.
4. Cross-facility assignment is impossible because client facility ids are discarded.

## Owner model

- Facility Owner/Admin remain the only migration operators.
- Platform Master Owner is unchanged (`isMedlumOwnerEmail` / owner routes).
- Import does not demote, replace, or orphan facility ownership.

## Failure handling

- API errors return safe, non-sensitive messages.
- Stack traces and raw SQL are not returned to clients.
- Partial commit failure rolls back the transaction.

## Regression posture

This feature does not change OPD, IPD, Emergency, Patient Index, appointments, billing, telemedicine, Clinical Assist, discharge, or existing `findAuthorizedPatient` / module RBAC behavior.

## Verification

```bash
node scripts/verify-facility-data-migration-security.mjs
```
