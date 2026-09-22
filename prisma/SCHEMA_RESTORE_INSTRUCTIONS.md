# CRITICAL: Restore prisma/schema.prisma

The schema file was corrupted during a large-file push attempt in the P1 pass.

## Restore immediately

1. Replace `prisma/schema.prisma` with the content from commit `80d0cccc` (last known good full schema, 36 models).
2. Then apply these additive fields:

### ClinicMember
```
staffCode String @default("")
designation String @default("")
department String @default("")
@@index([staffCode])
```

### Clinic
```
letterheadHeightMm Int @default(40)
showMedlumFooter Boolean @default(true)
```

3. Migration already exists at:
`prisma/migrations/20260922180000_staff_id_letterhead/migration.sql`

4. Or use the prepared full file from the agent artifacts: `SCHEMA_P1.prisma` (25746 bytes, 36 models).

## P1 code already on main (safe once schema restored)
- `src/lib/time.ts` — IST helpers
- `src/lib/staff-id.ts` — Staff ID allocator
- `src/lib/audit.ts` — staffCode + IST in audit meta
- `src/lib/ensure-clinic.ts` — assigns Staff ID
- `src/app/api/clinic/staff/route.ts` — GET/POST/PATCH with Staff ID
- `src/app/api/auth/me/route.ts` — exposes staffCode
- Storage production local FS refused (prior pass)
- Single Menu nav (prior pass)
- Emergency Enter blocked (prior pass)
