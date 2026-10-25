# MedLum repository agent instructions

These instructions apply to Codex, REA-enabled agents, and other automated coding assistants working in this repository.

## Product and safety invariants

- MedLum is a multi-tenant clinical workflow application. Derive user identity, role, clinic/facility scope, and consultant permissions from the authenticated server session and trusted server-side records. Never trust a client-supplied clinic ID, role, owner ID, or patient scope as authorization.
- Fail closed for unauthenticated or cross-tenant access. Preserve audit history for clinical signing, cancellation, consultant assignment/transfer, medication administration, and other consequential clinical actions.
- Use synthetic fixtures for tests and demonstrations. Do not send real patient information, production database rows, clinical documents, session cookies, credentials, API tokens, or screenshots containing PHI to REA, an external AI provider, issue comments, CI logs, or generated reports.
- Do not claim HIPAA compliance, FDA status, ONC certification, clinical safety, or readiness for real US patient data based on source code or green CI alone. Compliance needs verified controls, contractual scope, risk analysis, and accountable human review.
- External clinical-AI processing must remain disabled unless facility authorization/consent, provider terms, retention/data-transfer controls, clinical governance, and applicable legal review have been approved.
- Keep PACS disabled in production unless its own end-to-end safety and operational acceptance is explicitly completed. Use only synthetic DICOM data for tests.
- Never run destructive database commands, `prisma db push`, data imports, migrations, or restore drills against production. Production migrations use the protected manual workflow and reviewed migration SQL. Run schema tests only on disposable databases or isolated recovery targets.
- Preserve backwards compatibility for production schema changes. Prefer expand/contract migrations; document preconditions, rollback/forward-fix plans, and evidence.
- Do not change Vercel region, Neon project/region/plan, repository visibility, billing/spending limits, provider secrets, or production environment settings as a convenience workaround. Treat these as owner-approved operational decisions.

## Engineering workflow

- Start from current `main`; inspect the latest commit, related open PRs, workflow runs, and production deployment SHA before changing code. Do not duplicate an already-landed fix or work on a stale branch without rebasing/re-targeting it.
- Make changes on a focused branch and open a PR. Do not commit directly to `main`, merge your own unvalidated changes, bypass failing checks, or mark checks successful manually.
- A check that fails before step 1 with runner ID 0/no logs is an infrastructure/account/runner-start issue, not proof that application tests passed or failed. Re-run when appropriate and keep release gates fail-closed.
- Require successful CI on the exact current PR head, full-history secret scan, and production verification for the exact deployed SHA before considering a release verified.
- Never log environment values. Treat connection strings and all tokens/keys as secrets even when encrypted or masked in a dashboard.
- For API and workflow changes, test authentication, tenant isolation, permissions, idempotency/concurrency, failure paths, audit trails, and regression scenarios. Update or add executable regression tests in the repository's existing test conventions.
- Report only checks actually run. Distinguish repository-source evidence, test evidence, live deployment evidence, and provider/UI settings that remain unverified.
- Use REA for bounded source/runtime investigation and evidence collection. REA findings do not replace code review, test execution, clinical validation, or regulatory review. See [the REA engineering workflow](docs/REA_ENGINEERING_WORKFLOW.md).
