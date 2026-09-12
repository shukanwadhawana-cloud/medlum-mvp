# Phase 13 — Multi-device and role workflows

Phase 13 connects the existing clinical modules into a consistent workflow contract across web, tablet, phone, and desktop shells.

## Implemented

- Appointment lifecycle states: Scheduled → Confirmed → Waiting → In Consultation → Completed, with cancellation from active pre-completion states.
- Server-side appointment transition validation; invalid transitions return HTTP 409.
- Active clinic membership scoping for shared-clinic appointment access.
- Clinic roles: Owner, Admin, Consultant, Staff.
- Role permission policy for clinical work, appointments, telemedicine, billing, clinic administration, and inventory.
- Authenticated `/api/auth/me` profile now exposes active clinic memberships and primary role.
- API client exposes role-aware profile data and the telemedicine session entry point.
- Telemedicine sessions remain linked to the patient and appointment while retaining authenticated creation.
- Existing clinical patient workflow remains connected: encounter → prescription/labs/diagnostics → billing.
- Patient waiting-room and doctor video workflow remain part of the verification contract.

## Compatibility

The existing OPD UI can still complete a waiting patient directly. Video-enabled workflows can use the explicit `In Consultation` state before completion.

## Verification

`npm run test:multi-device-role-workflow` checks the complete Phase 13 contract. The main CI workflow runs this check before the production build.
