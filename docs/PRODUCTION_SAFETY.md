# MedLum Production Safety Checklist

Use this checklist before major changes to the production application.

## Before coding

- Confirm the current production GitHub commit.
- Confirm the Neon database is the intended production database.
- Never copy production secrets into source code, issues, or documentation.
- Never use destructive database reset commands against production.

## During implementation

- Derive doctor ownership from the authenticated server session.
- Preserve existing data models unless an additive change is required.
- Keep Vercel builds free of `prisma db push`.
- Avoid unnecessary dependencies and infrastructure.

## Before deployment

- Run the strongest available type/build/Prisma checks.
- Inspect the final diff for accidental changes.
- Confirm no secrets are staged.
- Commit to GitHub with a descriptive message.
- Verify the commit exists on the intended branch.

## After deployment

- Open the production app.
- Log in with an existing test account.
- Verify an existing patient and consultation.
- Verify prescription, appointment, and billing data.
- Create one harmless test record if needed.
- Log out and back in to verify persistence.
- Verify doctor isolation if the change affects access control.

## Recovery principle

If Vercel fails, recover the application from GitHub and reconnect it to the existing Neon database. Do not create a replacement database unless the database itself is confirmed lost and a deliberate recovery procedure has been chosen.
