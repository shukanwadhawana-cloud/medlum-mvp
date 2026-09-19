# MedLum production audit

## 2026-09-19 — Patient portal login + dashboard

### Root causes addressed
1. Exact phone match failed when formats differed (+91 vs 10-digit).
2. Session cookie now set on login `NextResponse` for reliable `Set-Cookie`.
3. Portal UI expanded: full dashboard at `/portal/dashboard`.

### Security
- Session-scoped data only (no client `patientId`).
- Active account re-check on me/data.
- HttpOnly + Secure (production) + SameSite=Lax portal cookie.
- bcrypt passwords; no secret/password logging.

### Known constraint
**Vercel Deployment Protection / SSO** may return HTTP 401 for public visitors until disabled on the production project for the patient portal hostname.

### Checklist
- [ ] CI green
- [ ] Vercel READY
- [ ] Deployment Protection allows public `/portal/*`
- [ ] Clinic creates portal credentials
- [ ] Patient login → dashboard
- [ ] Refresh keeps session
- [ ] Logout works
