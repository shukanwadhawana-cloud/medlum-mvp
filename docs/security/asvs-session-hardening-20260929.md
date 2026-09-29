# ASVS 5.0 session hardening verification

This note records the verification scope for the session-hardening change in PR #60.

- Current main baseline: 7751515879392e9af05bb7c286e3a6431776b8a0
- Security branch: security/asvs-session-revocation-20260929-v3
- Session state is persisted in AuthSession.
- JWTs carry a per-login session identifier and are checked against server-side session state.
- Logout revokes the server-side session before clearing the browser cookie.
- AuthSession uses nullable doctorId with ON DELETE SET NULL so security/audit history is retained when an account is removed.
- The ASVS verifier is executed by the main CI workflow.
- No product workflow or application architecture is intentionally changed by this documentation file.

Production deployment remains gated on a fresh green CI result for the exact security-branch commit and subsequent deployment verification.
