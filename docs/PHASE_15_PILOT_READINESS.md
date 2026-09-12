# Phase 15 — Pilot Readiness

Phase 15 is the final engineering gate before a controlled MedLum pilot.

## Implemented

- Production health endpoint at `/api/health` returning only non-sensitive service status, version and timestamp.
- Automated pilot-readiness verification in CI.
- Canonical Render deployment documentation remains the production deployment reference.
- Production safety and disaster-recovery documentation are required before pilot release.
- Required production environment variables remain documented and server-side.
- MedLum is the dashboard/home entry point; a duplicate Home navigation item is explicitly rejected.

## Pilot release checklist

1. Configure a strong production `SESSION_SECRET` (32+ characters; preferably generated randomly).
2. Configure the production PostgreSQL `DATABASE_URL`.
3. Configure EKA credentials only as server-side deployment secrets when the EKA integration is enabled.
4. Confirm the video provider configuration before live telemedicine use.
5. Confirm HTTPS and the production security headers are active.
6. Run the complete GitHub CI gate and require a green build.
7. Perform a controlled end-to-end pilot with test patient/doctor accounts before using real clinical data.
8. Confirm backup and recovery procedures before onboarding real records.

## Scope boundary

A green Phase 15 CI run means the repository is structurally ready for a controlled pilot. It does **not** by itself certify regulatory compliance, clinical safety, vendor contracts, or production environment configuration. Those remain deployment and operational responsibilities.
