# MedLum Help / Chatwoot Integration

Status: Phase 1 foundation only. No clinical workflow is replaced.

## Architecture

Chatwoot is a communication service beside MedLum, not a second clinical database.

- MedLum/PostgreSQL remains the source of truth for patients, OPD/IPD, encounters, prescriptions, labs, diagnostics, workforce and clinical notes.
- Chatwoot stores communication conversations and routing metadata.
- MedLum sends only the minimum identifiers/context required to connect a conversation to the correct facility or clinical record.
- Chatwoot outages must not block OPD, IPD, emergency, pharmacy, laboratory, diagnostics, workforce or authentication.

## MedLum context carried into Chatwoot

Supported mapping fields:

- `medlum_clinic_id`
- `medlum_clinic_name`
- `medlum_patient_id`
- `medlum_uhid`
- `medlum_encounter_id`
- `medlum_ipd_admission_id`
- `medlum_source` (`STAFF_HELP` or `PATIENT_COMMUNICATION`)
- `medlum_role`
- `medlum_staff_id`

Clinical notes, prescriptions, lab results and other clinical payloads must not be copied into Chatwoot custom attributes.

## Environment

Set these server-side only:

```env
CHATWOOT_BASE_URL=
CHATWOOT_API_TOKEN=
CHATWOOT_ACCOUNT_ID=
```

The browser must never receive `CHATWOOT_API_TOKEN`.

## Planned MedLum UI

A future **Help & Communication** entry will provide:

1. Staff Help
2. Patient Communication
3. Conversation history
4. MedLum context links
5. Role/facility-aware routing

The first production UI should be Staff Help. Patient communication should follow after the routing and authorization path is verified.

## Authorization boundary

A Chatwoot conversation does not grant access to a MedLum patient.

When a user opens a patient/clinical link, MedLum must re-check:

- authenticated session
- active clinic membership
- staff role
- patient/encounter authorization

Never use Chatwoot metadata as an authorization source.

## Phase 1 implementation

This branch introduces only the server-side Chatwoot adapter and integration contract. It does not modify Prisma clinical models or existing OPD/IPD flows.
