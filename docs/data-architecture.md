# MedLum data architecture — Phase 9A

## System of record

MedLum's PostgreSQL database is the canonical system of record for durable hospital and patient data. The application must remain usable without any external interoperability or video vendor being the authoritative database.

### Canonical MedLum data

- Patient demographics and longitudinal patient record
- Clinical encounters, notes, diagnoses and follow-up
- Prescriptions
- Appointments
- Laboratory and diagnostic orders/results
- Pharmacy inventory and dispensing transactions
- Billing, invoices and payments
- Insurance records and claims
- Blood-bank records
- Hospital/clinic membership and role information
- Audit logs

### External services

**EKA / ABDM:** interoperability boundary. Use it for ABDM connectivity, identity/consent and health-data exchange workflows. Do not use its retention window as MedLum's patient-record retention policy.

**Video provider:** transient communication layer. A video provider may carry a live consultation and, if recording is explicitly enabled later, temporary media. Consultation notes, prescriptions and clinical outcomes must be persisted in MedLum.

## Multi-device model

A hospital is a tenant/workspace. Laptops, tablets and phones authenticate users against the same MedLum backend and read/write the same hospital-scoped records according to role permissions. Data is not owned by an individual device.

Example: a doctor can create a prescription on a tablet and a pharmacy user can subsequently retrieve that prescription from a laptop in the same hospital workspace.

## Retention principles

1. Do not design durable clinical retention around an external vendor's short-lived storage window.
2. Do not delete clinical history merely because a user account/device is removed.
3. Prefer soft-delete/deactivation and auditability for clinical entities; destructive deletion should be an explicit, authorized data-governance operation.
4. External integrations should be replaceable without losing MedLum's canonical records.
5. Production retention periods must be configurable and documented per record class and applicable law/policy before a real hospital pilot handles live patient data.

## Phase 9A acceptance criteria

- A central MedLum database is explicitly documented as the source of truth.
- EKA/ABDM is an interoperability provider, not the canonical database.
- Video is a communication provider, not the canonical clinical record.
- The architecture supports multiple devices/users against one hospital workspace.
- CI verifies that the system-of-record policy remains intact.
