# MedLum Hospital MVP — System Audit & Implementation Plan
**Date:** 2026-09-19

## Architecture
Next.js 16 + Prisma/PostgreSQL. Tenant key: Clinic + ClinicMember.
Auth: JWT cookies. PHI: clinic membership gates (P1). CSRF/CSP (P1.5).

## Capability matrix (summary)
- Multi-clinic: Partial
- Cross-tenant isolation: Partial (server-side clinic scope + static verifier)
- Roles: Expanded foundation (Owner, Admin, Manager, Doctor, RMO, Nurse, Pharmacy, Laboratory, Billing, Receptionist, Staff)
- OTP 2-step: Foundation (Owner/Admin/Manager)
- Audit: Partial
- Patients/OPD/IPD/Billing/Lab/Pharmacy/Portal: Partial to Implemented as listed in code
- Tariff/ESIC/Excel: Schema foundation only
- Soft-delete/discharge: Patient foundation
- Lab templates: CBC system template API

## Phase 1 delivered (code)
OTP service, privileged login OTP, expanded RBAC, patient lifecycle API, lab CBC templates API, audit doc, foundation verifier, tenant isolation static verifier.

## Required ops
1. Apply Prisma migration `20260919180000_hospital_foundation_otp_tariff_lab` on production DB (see docs/hospital-ops-runbook.md)
2. Ensure `prisma/schema.prisma` includes OtpChallenge/Tariff/LabTemplate (done on main)
3. Configure TELEGRAM_BOT_TOKEN + TELEGRAM_OTP_CHAT_ID for production OTP delivery
4. Disable Vercel Deployment Protection for public hospital users

## Status update 2026-09-19 (evening)
- CI green on HEAD after data-retention + api-auth-coverage verifier fixes
- Schema 29 models verified on main
- Static: hospital-foundation, portal-auth, tenant-isolation, data-retention, api-auth-coverage
- Production health 200; portal login page 200
- **BLOCKER:** production PostgreSQL migration not yet applied (ops; see docs/hospital-ops-runbook.md)
- **BLOCKER:** TELEGRAM_* optional for OTP delivery in production

## Not yet production-complete
Excel tariff import UI, invoice tariff snapshots, full OPD product shell, full E2E Sanskriti Hospital acceptance, multi-hospital runtime isolation suite against production DB.

## Status update 2026-09-20 (Track A)

### Implemented this cycle
- **Excel tariff import**: `/api/tariffs/import` accepts `excelBase64` (.xlsx/.xls via sheetjs) + CSV + JSON rows.
  - Sheet detection, header auto-map, column mapping, preview/validate, transactional commit, audit.
  - Admin UI: `/clinic/tariffs`
- **Invoice tariff snapshot**: Invoice POST resolves active tariff by code/tariffItemId, writes
  `tariffVersionId/Name`, per-line `snapshotJson`, `billedRate`, `esicRate`. Future tariff changes do not rewrite invoices.
- **Invoice numbering**: `INV-YYYYMMDD-####` sequential per clinic.
- **Payment**: partial payment + outstanding balance + duplicate reference protection (60s).
- **Audit attribution**: `writeAudit` snapshots `actorName` + `at`; `formatAuditAttribution` for UI ("Done by Vijay · …").
- **Branding**: clinic branding API already tenant-scoped (name, logo, address, footer, registration).
- **Tariff versioning**: draft → activate (supersedes prior active, sets effectiveTo); immutable items on version.

### Still blocked / not runtime-verified
- Production DB migration apply (ops DATABASE_URL)
- TELEGRAM OTP production credentials
- Vercel Deployment Protection disable for public portal
- Full multi-hospital runtime isolation suite against live DB
- Structured CBC result entry UI (template API exists; LabOrder.result remains free-text/JSON)

### Track B
- `scripts/runtime-e2e-harness.mjs` documents seed + E2E plan; requires DATABASE_URL + RUNTIME_E2E_CONFIRM=YES
