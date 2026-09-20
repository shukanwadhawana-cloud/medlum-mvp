# MedLum MVP — Frozen Product Blueprint

**Status:** Frozen baseline for MVP validation  
**Source of truth:** current `main` implementation, not a future feature list  
**Rule:** validate and fix existing workflows before adding architecture or feature scope.

## 1. Product shape

MedLum is a multi-tenant hospital/clinic workflow application with separate clinical workspaces for **OPD** and **IPD**, shared patient records, investigations/labs, billing, tariff/versioning, staff/role management, auditability and owner-level hospital oversight.

Authentication for privileged users uses **ID/password + Telegram OTP**.

## 2. Primary navigation

### Clinical workspace
- OPD / Dashboard
- Patients
- IPD
- Appointments
- Emergency
- Labs
- Diagnostics
- Pharmacy
- Telemedicine

### More
- Patient Billing
- Blood Bank
- Insurance
- Reports
- Prescriptions
- Clinic Settings
- AI Assist
- Help
- Pricing & Plans

### Owner workspace
- Owner Dashboard
- Hospitals
- Hospital-level activity and collected billing overview

## 3. Frozen end-to-end MVP workflow

`Login → Telegram OTP → Dashboard → Clinic/Hospital → Staff → Patient → OPD/IPD → Investigation/Lab → Tariff → Invoice → Payment → Print/Receipt → Audit → Discharge → Search/Recovery`

The acceptance workflow must be tested as one connected journey, not as isolated screens.

## 4. Facility setup

A clinic/hospital can configure:
- Facility type
- OPD / IPD / BOTH product access
- License and registration numbers
- Owner/proprietor
- Doctor in charge
- Address/contact details
- Hospital branding and invoice identity

## 5. Staff and access

Owner/Admin manage clinic members and roles including clinical, nursing, pharmacy, laboratory, billing, reception and staff functions.

Every request must remain tenant-scoped. A member of Hospital A must not be able to read or mutate Hospital B's patients, encounters, tariffs or invoices.

## 6. Patient lifecycle

Patient registration supports identity/contact and hospital-specific registration information.

Required lifecycle:
- Register
- OPD consultation and/or IPD admission
- Clinical/investigation records
- Billing
- Discharge
- Historical search by available patient identifiers
- Recovery of deleted records by the authorized master/owner workflow

Discharged patients should leave the active dashboard while remaining searchable historically.

## 7. OPD

OPD is a distinct clinical workflow from IPD.

Expected flow:
- Patient selection/registration
- Consultation/encounter
- Complaint/history
- Diagnosis
- Prescription/follow-up
- Investigations
- Billing where applicable

## 8. IPD

Expected flow:
- Registration/admission
- Ward/room/bed
- Consultant/specialty
- Initial assessment
- Vitals and clinical notes
- Investigations
- Hospital summaries
- Discharge/transfer/DAMA lifecycle
- Billing and final settlement

## 9. Laboratory / CBC

The lab workflow must support structured templates.

Selecting **CBC** should expose structured parameters rather than forcing a free-text result, including the CBC parameter set represented by the configured template (for example Hb, WBC/counts and platelets).

## 10. Tariff / ESIC

Owner/Admin tariff workflow:
1. Upload XLS/XLSX/CSV
2. Inspect sheets/headers
3. Map fields
4. Preview validation
5. Import a named version
6. Activate a version
7. Preserve prior versions

Tariff data must remain clinic-specific.

Invoice lines must snapshot the applicable tariff/version/rate so later tariff changes do not rewrite historical invoices.

## 11. Billing / payment / invoice

The billing workflow must support:
- Invoice creation
- Hospital tariff rate
- ESIC/category rate where configured
- Invoice numbering
- Payment recording
- Outstanding balance
- Partial/final payment
- Printable invoice/receipt
- Historical invoice snapshot

The acceptance test must verify that a tariff update does not silently change an already-issued invoice.

## 12. Auditability

Clinical and operational records must retain enough attribution to answer:

> **Who added/changed this record?**

The UI should surface the responsible user where the workflow exposes attribution.

## 13. Authentication

Privileged login:
1. Email/ID + password
2. Telegram account link
3. Telegram OTP
4. Session creation

Current production Telegram flow is the active authentication path.

## 14. Deleted/discharged data

Deletion is not equivalent to irreversible disappearance for authorized recovery.

Discharged patients leave active operational lists but remain searchable.

Recovery must be restricted to the appropriate privileged role and must preserve tenant boundaries.

## 15. What is intentionally frozen

Do **not** expand the architecture merely because another possible hospital feature exists.

The current MVP acceptance target is the workflow above.

Additional modules already present in the codebase (for example telemedicine, ABDM/EKA integration, portal, blood bank, insurance and AI assist) should be treated as existing modules, not justification for redesigning the core architecture.

## 16. Acceptance gates

Before calling the MVP production-ready, verify:

- [ ] Telegram OTP works in production
- [ ] Owner/Admin can configure a facility
- [ ] Staff can be added/managed with roles
- [ ] Patient can be registered
- [ ] OPD encounter works
- [ ] IPD admission and clinical workflow works
- [ ] CBC structured workflow works
- [ ] Tariff import/version/activation works
- [ ] Invoice uses correct tariff snapshot
- [ ] Partial + final payment works
- [ ] Invoice/receipt prints correctly
- [ ] User attribution is visible
- [ ] Discharge removes patient from active workflow
- [ ] Discharged patient remains searchable
- [ ] Authorized recovery works
- [ ] Hospital A cannot access Hospital B data
- [ ] Production deployment is healthy

**Freeze rule:** if a gate fails, fix the smallest existing implementation required to make that gate pass. Do not redesign the product around the failure.
