# MedLum MVP

Multi-doctor clinical platform — Phase B: frontend connected to PostgreSQL.

## Architecture

```
Browser UI → /api/* (Next.js) → Prisma → PostgreSQL (Neon or any)
```

- Auth: bcrypt + HTTP-only JWT session cookie
- Isolation: server derives `doctorId` from session only
- No localStorage for production clinical data

## Setup

```bash
cp .env.example .env
# Set DATABASE_URL and SESSION_SECRET

npm install
npx prisma db push
npm run dev
```

## Env vars (never commit real values)

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — long random string

## Verify isolation

1. Sign up Doctor A → add patient / appt / rx / invoice
2. Logout → Sign up Doctor B
3. Confirm Doctor B cannot see Doctor A data
