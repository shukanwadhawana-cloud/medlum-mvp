# Hospital foundation — operations runbook

## Production database migration

**Migration file:** `prisma/migrations/20260919180000_hospital_foundation_otp_tariff_lab/migration.sql`

This migration is **additive only** (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). It does not drop tables or rewrite existing clinical data.

### Apply safely (recommended)

1. Confirm backup/snapshot of production PostgreSQL is available.
2. Connect with a role that can DDL (owner of public schema).
3. Run the SQL file against production:

```bash
# Example with psql (replace connection string; do not commit secrets)
psql "$DATABASE_URL" -f prisma/migrations/20260919180000_hospital_foundation_otp_tariff_lab/migration.sql
```

4. Verify tables/columns:

```sql
SELECT to_regclass('public."OtpChallenge"');
SELECT to_regclass('public."TariffVersion"');
SELECT to_regclass('public."LabTemplate"');
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'Patient' AND column_name IN ('status','deletedAt','registrationNo','uhid');
```

5. Optionally mark migration applied in Prisma migration history if using `prisma migrate deploy` workflow.

### Do NOT

- `prisma migrate reset`
- Drop or truncate clinical tables
- Run experimental schema push that rewrites enums without review

## OTP delivery environment

| Variable | Required | Purpose |
|----------|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Optional | Bot token for OTP DM |
| `TELEGRAM_OTP_CHAT_ID` | Optional | Chat/user id for OTP delivery |
| `DATABASE_URL` | Required | PostgreSQL |
| `SESSION_SECRET` | Required | JWT signing |

Without Telegram vars, OTP is issued and hashed in DB; in non-production a `devOtp` may be returned in the login response for testing. Production never returns plaintext OTP in API responses.

## Roles requiring OTP after password

Owner, Admin, Manager (and MasterOwner alias).

## Soft-delete / discharge

- `POST /api/patients/lifecycle` with `action`: `discharge` | `soft-delete` | `restore`
- Active patient lists exclude `deletedAt` and `ARCHIVED`
