# Production Investigation Catalog

The production clinical ordering surfaces use the shared `src/lib/diagnostic-catalog.ts` catalog.

The catalog is consumed by:
- Laboratory ordering (`src/app/labs/page.tsx`)
- Diagnostics ordering (`src/app/diagnostics/page.tsx`)
- Patient consultation ordering (`src/app/patients/[id]/page.tsx`)
- IPD/patient clinical workflows that reuse the patient ordering surface

This file intentionally records the production pipeline dependency so a deployment cannot be mistaken for a repository-only catalog update.

## Deployment acceptance

A catalog change is considered released only when the same `main` commit is:
1. present in GitHub `main`;
2. READY in the Vercel production deployment;
3. LIVE in the Render production service.
