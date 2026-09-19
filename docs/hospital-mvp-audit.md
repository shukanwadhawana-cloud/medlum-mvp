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
