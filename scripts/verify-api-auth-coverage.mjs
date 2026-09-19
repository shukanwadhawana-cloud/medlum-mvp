import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src", "app", "api");
const SPECIAL_CASES = new Set([
  "auth/login/route.ts", "auth/signup/route.ts", "auth/logout/route.ts",
  "auth/otp/verify/route.ts", // pre-session OTP verification (rate-limited)
  "public/booking/route.ts", "portal/auth/login/route.ts", "portal/auth/logout/route.ts",
  "portal/auth/reset/route.ts", "portal/auth/me/route.ts",
  "interoperability/eka/webhooks/route.ts",
  "telemedicine/join/route.ts",
]);

async function routeFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await routeFiles(path));
    else if (entry.name === "route.ts") files.push(path);
  }
  return files;
}

const routes = await routeFiles(ROOT);
const failures = [];
for (const file of routes) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const source = await readFile(file, "utf8");
  if (SPECIAL_CASES.has(rel)) continue;
  const usesPrisma = /\bprisma\b/.test(source);
  const authenticated = /getSession\s*\(|getPortalSession\s*\(/.test(source);
  const webhookVerified = /verify.*webhook|webhook.*verify|x-.*signature|signature/i.test(source);
  if (usesPrisma && !authenticated && !webhookVerified) {
    failures.push(`${rel}: Prisma-backed route has no authenticated session/webhook verification`);
  }
}
if (failures.length) {
  console.error("MedLum API authentication coverage verification FAILED");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`MedLum API authentication coverage verification PASSED (${routes.length} route files audited)`);
