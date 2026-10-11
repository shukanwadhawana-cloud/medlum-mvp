#!/usr/bin/env node
/**
 * Compatibility entrypoint. Real suite is scripts/p1-rbac-tenant-isolation.ts
 * (exercises production findAuthorizedPatient via tsx).
 */
console.error(
  "P1 RBAC isolation: run via `npm run test:rbac-tenant-isolation` (tsx + production clinic-auth)."
);
console.error("Direct node execution of the legacy .mjs duplicate is disabled.");
process.exit(2);
