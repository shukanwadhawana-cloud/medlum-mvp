# MedLum Platform Control Plane

## What is included
- Dedicated `/platform/login` entry point using the existing secure doctor session.
- Platform roles: `PlatformAdmin`, `PlatformSupport`, `PlatformDeveloper`, `PlatformBilling`.
- Founder dashboard at `/platform` with clinic, doctor, patient and payment aggregates.
- Subscription controls stored as append-only `AuditLog` records so this pilot does not require a Prisma migration.
- Default patient limit: **200 per clinic**.
- Server-side patient-limit enforcement in `/api/patients`.
- Subscription statuses: `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `EXPIRED`, `CANCELLED`.
- Expired/suspended clinics are rejected by the authenticated session layer; the session cookie is cleared when all non-platform memberships are inactive for billing purposes.
- Platform team login creation from the Founder dashboard.
- Developer/support diagnostics at `/platform/developer` without exposing patient clinical records.

## Founder bootstrap
Set `MEDLUM_PLATFORM_BOOTSTRAP_SECRET` as a deployment secret. Then call the authenticated deployment URL once:

```json
POST /api/platform
{
  "action": "bootstrap",
  "bootstrapSecret": "<deployment-secret>",
  "name": "MedLum Founder",
  "email": "founder@example.com",
  "password": "<strong-password>"
}
```

After successful bootstrap, log in at `/platform/login`. The bootstrap secret should then be rotated or removed from the deployment environment.

## Subscription lifecycle
A clinic with no subscription audit record defaults to the pilot state: `ACTIVE`, `Pilot`, 200 patients.

The Founder can change status, due date, plan and patient limit from the dashboard. The patient limit is enforced by the API, not only by the UI.

Recommended lifecycle:

`ACTIVE -> PAST_DUE -> SUSPENDED`

A due date in the past automatically behaves as `EXPIRED` while the stored status remains `ACTIVE`.

## Important pilot limitation
This first control-plane implementation intentionally avoids a schema migration by using the existing audit log as an append-only subscription configuration store. Before commercial billing at scale, migrate subscriptions, plans and platform users to dedicated Prisma models and connect a real payment provider/webhook system.
