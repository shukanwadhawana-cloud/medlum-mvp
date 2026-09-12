# MedLum — Multi-Consultant Architecture

## Why this is needed

The current MedLum data model scopes patients, appointments, encounters, prescriptions, labs, pharmacy and diagnostics directly to a single `Doctor`. That is safe for a single-doctor clinic, but it will become cumbersome when a clinic has multiple consultants because each consultant would effectively see a separate data universe.

MedLum should move to a **clinic/organization-owned data model with consultant attribution**.

## Target model

### Clinic
A clinic/organization becomes the primary tenant.

Suggested fields:
- `id`
- `name`
- `createdAt`
- `updatedAt`

### Consultant / User
The existing `Doctor` record becomes the login/user identity for a consultant.

Suggested additions:
- `clinicId`
- `role` — `OWNER`, `ADMIN`, `CONSULTANT`, `STAFF`
- `active`

A consultant belongs to one clinic initially. This keeps the implementation simple while allowing the clinic to grow.

### Clinic-owned clinical data
These records should eventually use `clinicId` for tenancy/security rather than relying only on `doctorId`:

- Patient
- Appointment
- Encounter
- Prescription
- Invoice
- LabOrder
- DiagnosticOrder
- PharmacyItem
- Dispensing
- AuditLog

The records should retain `doctorId` where attribution matters. For example:

- Patient → clinic owner, not individual consultant
- Encounter → clinic + consulting doctor
- Prescription → clinic + prescribing doctor
- DiagnosticOrder → clinic + ordering doctor
- Appointment → clinic + assigned consultant

## Access rules

### Owner/Admin
Can manage the clinic and see all clinic patients and activity, subject to future role permissions.

### Consultant
Can see clinic patients and clinical history according to clinic policy, while new clinical activity is attributed to that consultant.

### Staff
Can handle operational workflows such as registration, appointments, billing and pharmacy according to permissions, without automatically receiving clinical editing rights.

## Critical security rule

Never trust `clinicId`, `doctorId`, or ownership identifiers supplied by the browser.

The server must derive the authenticated user from the session, resolve the user's clinic, and apply the appropriate clinic/role scope to every API query and mutation.

## Patient identity

Patients should be unique within a clinic, not duplicated merely because a different consultant sees them.

The eventual migration should support finding an existing patient by clinic + phone/name and opening the same longitudinal record for different consultants.

## Clinical attribution

A shared patient record does **not** mean loss of attribution.

Every clinical event should continue to record the responsible consultant:

`Clinic → Patient → Encounter → Consultant`

and related orders should link back to the encounter and ordering consultant where appropriate.

This gives the clinic a unified patient history while preserving who actually provided the care.

## Migration strategy

Do not perform a destructive rewrite of the existing production database.

Recommended sequence:

1. Add `Clinic`.
2. Add `clinicId` to `Doctor` and backfill one clinic per existing doctor.
3. Add consultant role/active status.
4. Add `clinicId` to clinical/operational tables.
5. Backfill each existing row from its current `doctorId`.
6. Update session helpers to expose `doctorId + clinicId + role`.
7. Change APIs from doctor-only scope to clinic scope plus role checks.
8. Update UI so consultants share the same patient workspace.
9. Keep `doctorId` on events/orders for attribution.
10. Add clinic administration and consultant management UI.
11. Only after verification, make `clinicId` required and add indexes/constraints.

## What this prevents

This architecture prevents the future system from becoming a collection of isolated consultant accounts. A clinic can add 2, 5, 20 or more consultants without creating separate patient databases or requiring manual patient duplication.

## Implementation boundary

This document is an architecture commitment, not a production migration. The migration should be implemented as a separate major phase after the current patient-loading reliability issue is hardened and the pending Diagnostics database migration is completed.
