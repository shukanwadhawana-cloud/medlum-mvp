# MedLum — Eka Care Reference Alignment

## Purpose

MedLum uses the open-source Eka Care / Care project as a clinical-workflow reference. This document prevents future features from being invented without first checking an established Care workflow.

Reference projects:
- Eka Care Care backend: `eka-care/ohc-be-care`
- Care frontend: `ohcnetwork/care_fe`
- EkaScribe Care plugin: `ohcnetwork/care_eka_scribe_fe`

## Current alignment

### Patient → Encounter workflow
Care organizes clinical work around an encounter and exposes an encounter overview rather than treating a consultation as an isolated generic form. Its overview brings together clinical history, quick actions, allergies, symptoms, diagnosis, vitals and questionnaire/form responses, with a summary panel alongside the main clinical content.

MedLum currently maps this to:
- Patient → Encounter
- Chief complaint / clinical notes
- Assessment / diagnosis / plan
- Vitals
- Prescription linked to encounter
- Follow-up date
- Billing linked to the consultation workflow
- Patient-level clinical history

### Patient context before documentation
Care presents important patient context and a direct clinical-history action at the encounter level. MedLum now provides a compact clinical summary above the patient timeline, including allergies, baseline BP, latest diagnosis/complaint and latest available vitals.

### OPD productivity
MedLum's dashboard and appointments queue provide the outpatient operational layer around the encounter:
- Today's OPD
- Waiting / scheduled / completed queue
- Check-in
- Start Consultation
- Patient search by name or phone
- Follow-up visibility

## Deliberately not copied

MedLum is not being converted into the Care backend architecture. We keep the existing Next.js + Prisma + PostgreSQL + HTTP-only JWT architecture and its doctor-scoped ownership model.

We also do not add ABDM, telemedicine, hospital inventory, device integrations, AI scribe, or other Care plugins unless a separate phase explicitly requires them.

## Rule for future development

Before adding a clinical feature:

1. Inspect the relevant Care frontend/backend implementation.
2. Identify the underlying workflow/data model that is actually useful.
3. Map the concept to MedLum's existing architecture.
4. Add the smallest safe implementation that preserves existing production data and security.
5. Test authentication, doctor ownership, persistence and mobile UX.

Never perform destructive production database changes merely to imitate another architecture.
