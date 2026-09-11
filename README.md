# MedLum MVP

Multi-doctor clinical platform for OPD workflows.

## Phase A — Backend foundation

- PostgreSQL via Prisma (any host: set `DATABASE_URL`)
- Secure auth: bcrypt password hashing + HTTP-only JWT session cookie
- API routes for Doctor, Patient, Appointment, Prescription, Invoice
- Server-side doctor isolation (never trust client-supplied doctorId)
- AuditLog foundation

### Setup

```bash
cp .env.example .env
# Edit DATABASE_URL and SESSION_SECRET

npm install
npx prisma db push
npm run dev
```

### API

| Method | Path | Auth |
|--------|------|------|
| POST | /api/auth/signup | public |
| POST | /api/auth/login | public |
| POST | /api/auth/logout | session |
| GET | /api/auth/me | session |
| GET/POST | /api/patients | session |
| GET/POST/PATCH | /api/appointments | session |
| GET/POST | /api/prescriptions | session |
| GET/POST/PATCH | /api/invoices | session |

Frontend still includes localStorage helpers during progressive migration.
