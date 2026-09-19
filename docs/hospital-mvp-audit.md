# MedLum Hospital MVP — System Audit & Implementation Plan
**Date:** 2026-09-19

## Architecture
Next.js 16 + Prisma/PostgreSQL. Tenant key: Clinic + ClinicMember.
Auth: JWT cookies. PHI: clinic membership gates (P1). CSRF/CSP (P1.5).

## Capability matrix (summary)
- Multi-clinic: Partial
- Cross-tenant isolation: Partial (server-side clinic scope)
- Roles: Expanded foundation (Owner, Admin, Manager, Doctor, RMO, Nurse, Pharmacy, Laboratory, Billing, Receptionist, Staff)
- OTP 2-step: Foundation (Owner/Admin/Manager)
- Audit: Partial
- Patients/OPD/IPD/Billing/Lab/Pharmacy/Portal: Partial to Implemented as listed in code
- Tariff/ESIC/Excel: Schema foundation only
- Soft-delete/discharge: Patient foundation
- Lab templates: CBC system template API

## Phase 1 delivered (code)
OTP service, privileged login OTP, expanded RBAC, patient lifecycle API, lab CBC templates API, audit doc, foundation verifier.

## Required ops
1. Apply Prisma migration `20260919180000_hospital_foundation_otp_tariff_lab` on production DB
2. Ensure `prisma/schema.prisma` includes OtpChallenge/Tariff/LabTemplate (push if missing)
3. Configure TELEGRAM_BOT_TOKEN + TELEGRAM_OTP_CHAT_ID for production OTP delivery
4. Disable Vercel Deployment Protection for public hospital users

## Not yet production-complete
Excel tariff import UI, invoice tariff snapshots, full OPD product shell, full E2E Sanskriti Hospital acceptance, multi-hospital isolation test suite execution in production.
