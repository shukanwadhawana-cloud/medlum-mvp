# Phase B — Legacy Patient.clinicId correction

## Safe rule (only)

A patient row may be corrected when **all** of the following hold:

1. `Patient.clinicId` is `null`
2. `Patient.deletedAt` is `null`
3. `Patient.doctorId` is an **active** `ClinicMember` of **exactly one** clinic

Then set `clinicId` to that single clinic.

## Must not

- Guess when the doctor has **0** or **2+** active memberships (leave unresolved)
- Overwrite a non-null `clinicId`
- Assign a facility unrelated to the owning doctor’s memberships
- Auto-merge patients

## Idempotency

Uses `updateMany({ where: { id, clinicId: null }, data: { clinicId } })` so re-runs are no-ops for already-corrected rows.

## Audit

Each successful correction writes `AuditLog` action `FACILITY_LEGACY_CLINICID_CORRECTION`.

## Operator procedure (production)

1. Run with `dryRun: true` and inspect candidate counts
2. Confirm no cross-facility guessing
3. Confirm existing non-null `clinicId` values would be untouched
4. Run for real only with explicit approval
5. Re-run dryRun/real to confirm idempotency

Implementation: `src/lib/data/legacy-clinicid-correction.ts`  
Gate: `npm run test:phase-b-legacy-clinicid`

This does **not** replace Phase A disaster-recovery documentation or invent automated backups.
