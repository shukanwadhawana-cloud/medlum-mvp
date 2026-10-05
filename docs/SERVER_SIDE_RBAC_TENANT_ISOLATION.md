# Server-side RBAC and tenant isolation

## Authentication

- Session cookie established after login (and Telegram OTP for privileged roles).
- `getSession()` is required on sensitive API routes.
- Unauthenticated requests receive **401**.

## Platform owner

- Platform Master Owner is recognized only via `MEDLUM_OWNER_EMAIL` (server env).
- Facility Owner is a **clinic membership role**, not platform owner.
- Clinic staff APIs cannot rewrite platform-owner identity or assign platform Owner.

## Facility membership

- Active facility is resolved by `requireActiveClinicMembership(doctorId)`.
- The `medlum_active_clinic` cookie is a **selector only**; the database membership row is the security boundary.
- Client-supplied `clinicId` / `facilityId` / `destinationClinicId` never override membership.

## Role authorization

Server permission helpers (see `src/lib/permissions.ts` and `src/lib/server-authz.ts`):

| Permission | Roles (summary) |
|------------|-----------------|
| prescribe | Owner, Admin, Manager, Consultant, Doctor, RMO |
| order_labs | same as prescribe |
| enter_lab_result | Owner, Admin, Manager, Laboratory |
| dispense | Owner, Admin, Manager, Pharmacy |
| manage_mar | Owner, Admin, Manager, Consultant, Doctor, RMO, Nurse |
| view_clinical_chart | Owner, Admin, Manager, Consultant, Doctor, RMO, Nurse |
| view_billing | Owner, Admin, Receptionist, Billing |
| manage_staff | Owner, Admin, Manager |
| manage_clinic | Owner, Admin |

API routes must call these checks server-side. UI helpers are presentation-only.

## Patient / facility scoping

- `findAuthorizedPatient(membership, patientId)` allows access when:
  1. `patient.clinicId === membership.clinicId`, or
  2. **Legacy:** `patient.clinicId === null` AND `patient.doctorId` is an active member of this facility.
- Cross-facility patient IDs return not found / denied.
- Linked records (notes, prescriptions, labs, invoices, encounters) must resolve through this patient boundary.

## Sensitive mutations

- Role permission + facility scope + lifecycle rules (e.g. finalized records) are enforced on the server.
- Knowing a resource ID is not sufficient for access.

## Security tests

- Static: `scripts/verify-tenant-isolation.mjs`, `scripts/verify-api-auth-coverage.mjs`
- Integration (Postgres): `scripts/p1-rbac-tenant-isolation.mjs`

## Remaining roadmap (not closed by this document)

Razorpay idempotency, durable storage, OCR lifecycle, AI opt-in, migration baseline, rate-limit, public booking, backup/DR, etc.
