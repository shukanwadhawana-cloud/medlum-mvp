# Phase 14 — Production Security & Compliance Foundation

Phase 14 establishes a production security baseline without introducing a risky major dependency upgrade.

## Implemented

- Security response headers on application responses.
- HSTS in production only.
- Same-origin enforcement for state-changing `/api/*` requests when the browser provides an `Origin` header.
- HttpOnly, Secure-in-production, SameSite=Lax session cookie options centralized in the session module.
- Production `SESSION_SECRET` requirement of at least 32 characters.
- Server-only EKA credential convention documented in `.env.example`.
- Automated Phase 14 verification in CI before the existing application build.

## Dependency policy

The current CI output reports three high-severity npm audit findings and a Prisma major-version update notice. Phase 14 does **not** run `npm audit fix --force` or upgrade Prisma 6 to an RC major release automatically. Those changes require dependency-level investigation and regression testing rather than being mixed into the security baseline.

## Production requirements

Before a real clinical pilot, configure a strong random `SESSION_SECRET`, HTTPS, production database credentials, EKA credentials, and provider credentials only through the deployment secret manager/environment. Never expose server credentials through `NEXT_PUBLIC_*` variables.
