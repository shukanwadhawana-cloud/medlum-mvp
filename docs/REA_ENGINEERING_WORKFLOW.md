# REA engineering workflow for MedLum

This guide describes how to use [morluto/rea](https://github.com/morluto/rea) to investigate MedLum's code and test workflows. REA is an engineering-time investigation tool; it is not a MedLum runtime dependency, a clinical decision engine, or a substitute for tests and human review.

## 1. Install safely in the development environment

Use the official repository and package links only. REA's current README documents Node.js 22.23.4+, 24.22.1+, or 26.12.1+ and the setup command `npx rea-agents@latest setup`.

1. Confirm the local development machine's Node version satisfies the installed REA package requirement.
2. On the developer/agent machine (not inside MedLum's production deployment), review the official installation instructions and run `npx rea-agents@latest setup`.
3. Review the configuration changes proposed by setup, approve only the desired agent registration, and restart the agent.
4. Confirm the active agent can discover REA using its supported MCP configuration. Use `rea --help` if the CLI was installed globally.
5. Do not add REA to MedLum's runtime dependencies or deploy its MCP server to production. Keep the tool local to the development environment unless a separately reviewed architecture decision says otherwise.

REA setup updates the developer's agent configuration; it is not automatically part of the MedLum Git repository. Do not commit local credentials, agent session tokens, or personal configuration files.

## 2. Investigation scope and data boundary

Use only the checked-out source, source maps/bundles produced locally from that checkout, tests, generated synthetic fixtures, and non-sensitive configuration examples.

Do **not** provide REA or any connected model with:

- Production database URLs, credentials, cookies, tokens, or decrypted environment variables.
- Real patient records, identifiable clinical documents, images, lab reports, prescriptions, or production exports.
- Production logs or screenshots that may contain patient/owner information.
- Access to authenticated production sessions or the live production database for exploratory reverse engineering.

Use a disposable local database, synthetic patient identities, and synthetic documents for runtime experiments. If a claim cannot be established without production information, record it as an external verification requirement rather than retrieving the information into the agent.

## 3. High-value MedLum investigation targets

Use one focused investigation per PR or issue. Ask REA to trace the full path from the observable behavior to code and tests, and require it to distinguish source facts, runtime observations, assumptions, and unknowns.

### A. Facility Telegram connection handshake

Trace the facility owner's Start/deep-link flow through token creation, parsing, atomic claim/binding, tenant/owner validation, database persistence, duplicate/retry handling, and bot response. Verify that concurrent updates cannot bind the wrong owner/facility and that failure messages are actionable without exposing secrets. Use synthetic bot updates; a source trace is not proof that a real facility's chat is bound. The final end-to-end check must be authorized by the facility owner and use a test notification.

### B. Consultant assignment and transfer

Trace consultant creation, assignment, transfer, access checks, transactional update, and audit trail. Verify that the old assignment is ended coherently, the new consultant is permitted for the facility, unauthorized staff cannot assign a clinician, and retries do not create duplicate assignments. Turn each confirmed gap into a regression test.

### C. Clinical note signing and cancellation

Map draft, author signing, co-signing/double verification, cancel-before-co-sign, signed-record immutability, and audit metadata. Verify server-side policy and concurrent-update behavior rather than relying on UI hiding or button state. Use synthetic notes and roles.

### D. OCR, lab reports, and Clinical Assist

Trace upload validation, document identity/source checksum, extraction worker boundaries, retries, persisted result linkage, and safe failure behavior. Confirm OCR failure never silently invents results or marks an unreviewed result as finalized. Do not use real clinical documents as analysis fixtures.

### E. Backup and recovery

Trace the manual/scheduled backup workflow, environment approvals, key custody, encrypted upload, checksum verification, lifecycle/retention policy, and isolated restore steps. Read code and synthetic test artifacts only. A workflow being syntactically valid or CI-green does not mean a real backup exists or that it can be restored.

### F. Tenant isolation and authorization

For each sensitive route, trace session parsing → role and facility scope → service/data-layer query → response filtering. Identify whether a client-controlled ID could escape the server-derived tenant boundary. Verify failures using seeded disposable PostgreSQL data across two synthetic facilities.

## 4. Standard investigation prompt

Use the following as the initial task for a REA-enabled agent:

> Investigate the specific MedLum workflow named in this task using the current checked-out source and synthetic fixtures only. Trace the end-to-end path from entrypoint/route through authorization, domain services, persistence, side effects, and user-visible response. Cite exact file paths and symbols for every source claim. Identify transactional and concurrency behavior, tenant/role boundaries, idempotency, failure paths, logging and secret/PHI exposure risk, and existing tests. Separate confirmed facts from inference and unknowns. Do not access production data, decrypt credentials, or modify code during the investigation phase. Return a compact evidence table with: observation, source evidence, risk, missing test, and minimal recommended fix. Do not claim the problem is fixed until a separate implementation branch runs the relevant regression tests.

## 5. Evidence-to-code workflow

1. **Baseline:** record current `main` SHA, related PRs, relevant CI run IDs, and production SHA. Avoid stale or duplicate branches.
2. **Investigate:** use REA to trace the code; independently inspect each cited path and confirm the analysis is grounded in the current checkout.
3. **Reproduce:** build a minimal synthetic fixture for the reported behavior. Do not assume REA's explanation proves runtime behavior.
4. **Implement:** make the smallest server-side change that preserves existing workflows and safety invariants.
5. **Test:** add a regression test using project conventions. Cover authorization, cross-tenant attempts, retry/concurrency, and failure semantics when relevant.
6. **Validate:** run the targeted test, typecheck/build and full required CI. A CI runner that never starts is an infrastructure failure, not a passing test.
7. **Review:** inspect the diff, migration impact, logs, secrets, and backward compatibility; request human clinical/security review when a change affects clinical behavior or sensitive data.
8. **Release:** use the protected release process; verify the exact deployed SHA and run the read-only production smoke checks. For a clinical workflow, complete the approved synthetic or owner-authorized pilot acceptance separately.

## 6. Evidence format for completed investigations

Every investigation report should record:

| Field | Required content |
|---|---|
| Scope | Workflow, target commit, files/symbols inspected |
| Observed behavior | Reproducible behavior using synthetic data, or explicitly marked source-only |
| Evidence | Exact paths/symbols and test output references |
| Security boundary | Authenticated principal, role, tenant/facility scope, external calls |
| Concurrency/data | Transaction boundaries, idempotency, uniqueness constraints, failure recovery |
| Gap | Confirmed defect vs uncertainty; avoid mixing them |
| Regression | Test name/command and actual result |
| Release readiness | CI/deployed SHA evidence and any owner/provider action still required |

Do not create sweeping rewrites based only on a reverse-engineering report. Prioritize reproducible issues, minimal diffs, regression coverage, and an auditable release path.
