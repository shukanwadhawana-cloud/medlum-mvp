# MedLum — Interoperability & Ecosystem Architecture v1

## Goal

Keep the existing MedLum EMR as the clinical source of truth while adding an interoperability layer around it. External networks and vendors must plug into MedLum through provider-neutral adapters rather than becoming part of the core data model.

```text
                         ┌──────────────────────────────┐
                         │        MedLum EMR Core       │
                         │ Patients • Encounters • Rx   │
                         │ Labs • Diagnostics • Billing │
                         └──────────────┬───────────────┘
                                        │
                              Interoperability Layer
                                        │
       ┌───────────────┬────────────────┼────────────────┬───────────────┐
       │               │                │                │               │
    ABDM/FHIR       Booking          Claims         Blood-bank      External labs
       │               │                │                │               │
   Eka/direct          UHI            NHCX/TPA      UHI/e-Raktkosh     Lab adapters
       │
   ABHA + consent
       │
       └────────────────────── Patient ecosystem ────────────────────────┘
```

## Principles

1. **EMR first:** existing clinical workflows remain the source of truth.
2. **Adapters, not lock-in:** Eka can be an ABDM provider without making MedLum dependent on Eka-specific data structures.
3. **Consent before exchange:** external health-record access is a consented interoperability operation, not a normal internal patient lookup.
4. **FHIR at the boundary:** map MedLum's current records to FHIR resources when exchanging data; do not rewrite the Prisma model just to look like FHIR.
5. **No credentials in Git:** vendor credentials and production endpoints are environment/configuration concerns.
6. **No destructive migration:** v1 adds contracts and adapters without changing production tables.
7. **Free-first:** the architecture must work without paid infrastructure until a real external partner requires credentials or a paid service.

## v1 capability map

| Domain | v1 status | Boundary |
|---|---|---|
| ABHA/ABDM | Adapter contract | `EKA_ABDM` / `DIRECT_ABDM` |
| Consent | Provider-neutral command | ABDM adapter |
| FHIR | Mapping layer | Patient, Encounter, Observation, MedicationRequest, ServiceRequest |
| Booking | Adapter contract | UHI |
| Insurance/TPA | Adapter contract | NHCX/TPA |
| Blood bank | Adapter contract | UHI/e-Raktkosh-style discovery |
| External labs | Adapter contract | order/result + FHIR |
| Patient ecosystem | Architecture boundary | ABHA/PHR + patient-facing MedLum later |

## Current implementation

- `src/lib/interoperability/types.ts` contains provider-neutral contracts.
- `src/lib/interoperability/adapters.ts` contains the adapter registry and capability lookup.
- `src/lib/interoperability/fhir.ts` contains pure FHIR mapping helpers.
- `/api/interoperability/status` exposes the current adapter plan to authenticated MedLum users.
- No external HTTP call is made by these files.
- No Prisma schema change is required for v1.
- No production database migration is required for v1.

## ABHA/ABDM direction

ABHA is the identity/health-account layer, not an insurance product. MedLum should eventually support:

1. create/link ABHA;
2. associate an ABHA/ABHA address with the MedLum patient through an explicit workflow;
3. request consent for specified records and purposes;
4. exchange FHIR-based records through an ABDM-connected provider;
5. retain an audit trail of external exchange operations.

Eka Care's ABDM Connect is a possible first adapter because it currently advertises ABHA creation, consent management and health-record exchange. Direct ABDM remains a separate adapter so MedLum is not permanently coupled to one vendor.

## FHIR boundary

Initial mapping targets:

- `Patient` → FHIR `Patient`
- `Encounter` → FHIR `Encounter`
- vitals → FHIR `Observation`
- prescriptions → FHIR `MedicationRequest`
- lab/diagnostic orders → FHIR `ServiceRequest`
- later lab reports → FHIR `DiagnosticReport` + `Observation`
- later documents → FHIR `DocumentReference`

The v1 mapper is intentionally small. It is a boundary adapter, not a claim that every MedLum field is already ABDM-certified or production-ready for every FHIR profile.

## Booking

Booking should be modeled as a discovery/transaction adapter:

`MedLum availability → external network discovery → patient chooses slot → booking confirmation → MedLum Appointment`

The external booking identifier should eventually be stored alongside the local appointment rather than replacing the MedLum appointment ID.

## Insurance / TPA

Insurance must remain separate from ordinary billing:

`Patient → Coverage/Eligibility → Pre-auth → Claim → Adjudication → Payment/Reconciliation`

The existing `Invoice`/`Payment` workflow remains the clinic's financial ledger. A future claims adapter should reference invoices and encounters rather than replacing them.

## Blood bank

Blood availability is a discovery workflow, not a clinical inventory table inside MedLum:

`request: blood group + component + location → external availability → results → contact/reservation workflow`

MedLum should not claim that an external unit is reserved or available until the external network confirms it.

## External laboratories

The current `LabOrder` remains the local order. A future adapter adds:

- external lab/provider ID;
- external order ID;
- order status mapping;
- result/report retrieval;
- provenance;
- FHIR conversion where supported.

This should be additive and backward-compatible with today's local lab workflow.

## Patient ecosystem

The long-term patient layer is:

`ABHA identity → consent → MedLum longitudinal record → external records → appointments → labs/diagnostics → payments/claims → patient access`

The patient should be able to see a coherent longitudinal record without MedLum becoming the owner of every external service.

## Security boundary

External integrations must never bypass the existing session and clinic authorization model. Internal MedLum access continues to derive identity from the HTTP-only session. External exchange additionally requires explicit provider configuration and, where applicable, patient consent.

## What is deliberately NOT done in v1

- No production ABHA API calls.
- No credentials or API keys committed.
- No fake booking/insurance/blood-bank confirmations.
- No production database migration.
- No replacement of the current EMR UI.
- No vendor-specific fields added to core clinical tables yet.

Those are integration phases, not architecture placeholders.
