import { readFile } from "node:fs/promises";

const files = {
  transport: "src/lib/interoperability/eka.ts",
  adapter: "src/lib/interoperability/eka-onboarding-adapter.ts",
  onboardRoute: "src/app/api/interoperability/eka/onboard/route.ts",
  statusRoute: "src/app/api/interoperability/eka/status/route.ts",
  clinic: "src/app/clinic/page.tsx",
};

const source = {};
for (const [key, path] of Object.entries(files)) source[key] = await readFile(path, "utf8");

const checks = [
  ["transport endpoint", source.transport.includes('"/abdm/v1/hip/onboard"')],
  ["transport POST", source.transport.includes('method: "POST"')],
  ["transport required EKA config", source.transport.includes('required("EKA_API_KEY")') && source.transport.includes('required("EKA_CLIENT_ID")') && source.transport.includes('required("EKA_CLIENT_SECRET")')],
  ["adapter uses EKA transport", source.adapter.includes("ekaOnboardFacility(input)")],
  ["adapter provider", source.adapter.includes('provider: "EKA_ABDM"')],
  ["adapter typed result", source.adapter.includes("AdapterResult<EkaFacilityOnboardResult>")],
  ["onboard auth", source.onboardRoute.includes("getSession()")],
  ["onboard role gate", source.onboardRoute.includes('["Owner", "Admin"]')],
  ["onboard input validation", source.onboardRoute.includes("clinicId and hipId are required")],
  ["onboard upstream failure", source.onboardRoute.includes("status: 503")],
  ["onboard success response", source.onboardRoute.includes('success: true')],
  ["status auth", source.statusRoute.includes("getSession()")],
  ["status role gate", source.statusRoute.includes('["Owner", "Admin"]')],
  ["status hides secrets", !source.statusRoute.includes("CLIENT_SECRET")],
  ["clinic integration UI", source.clinic.includes("ABDM / EKA integration")],
  ["clinic calls onboarding", source.clinic.includes('/api/interoperability/eka/onboard')],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error(`EKA onboarding verification failed (${failed.length}):`);
  for (const name of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log(`EKA onboarding verification passed: ${checks.length} checks.`);
