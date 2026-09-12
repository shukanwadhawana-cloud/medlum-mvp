# Phase 16 — Production Pilot Validation

Phase 16 validates the deployed Render application after the repository-level engineering gates are green.

## Automated production smoke gate

The post-deploy workflow runs after a successful `MedLum CI` run on `main` and waits for the canonical Render deployment to become healthy.

It validates:

- `/api/health` returns HTTP 200 and a non-sensitive `status: ok` response.
- `/login` is reachable.
- Unauthenticated `GET /api/patients` is rejected with HTTP 401.
- Production security headers are present, including HSTS.

The smoke gate does not create, modify, or delete clinical records and does not require production credentials.

## Controlled manual pilot checklist

Before real clinical data is introduced, an operator should manually verify with dedicated test accounts:

1. Login and logout.
2. Dashboard/Home entry through the MedLum brand mark; no duplicate Home navigation item.
3. Patient creation, viewing, and clinic isolation.
4. Appointment creation and lifecycle transitions.
5. Telemedicine waiting room → video → consultation completion.
6. Prescription/clinical workflow and audit behavior.
7. Billing, pharmacy, labs, diagnostics, insurance, reports, and clinic navigation.
8. Responsive behavior on phone, tablet, and desktop.
9. Error handling for expired sessions and unauthorized API access.
10. Existing production records remain present after deployment.
11. Database backup and recovery procedure is documented and tested separately.

## Safety boundary

Automated production smoke validation is an availability/security regression gate. It is not a substitute for clinical validation, regulatory review, data-processing agreements, vendor review, or a tested disaster-recovery procedure.

Do not use real patient data during the first validation pass.
