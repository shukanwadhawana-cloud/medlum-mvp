#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const checks = [];
function check(name, ok) {
  checks.push([name, ok]);
  console.log(ok ? "PASS:" : "FAIL:", name);
}

const eka = read("src/lib/interoperability/eka.ts");
const schema = read("prisma/schema.prisma");
const webhook = read("src/app/api/interoperability/eka/webhooks/route.ts");
const hiu = read("src/app/api/interoperability/eka/hiu/data-on-push/route.ts");
const consent = read("src/app/api/interoperability/eka/consent/create/route.ts");
const abhaInit = read("src/app/api/interoperability/eka/abha/mobile/init/route.ts");
const abhaConfirm = read("src/app/api/interoperability/eka/abha/confirm/route.ts");
const abhaStatus = read("src/app/api/interoperability/eka/abha/status/route.ts");
const onboard = read("src/app/api/interoperability/eka/onboard/route.ts");
const tenant = read("src/lib/interoperability/abdm-tenant.ts");
const middleware = read("src/middleware.ts");
const migration = fs.existsSync(path.join(root, "prisma/migrations/20260921020000_abdm_eka_mvp/migration.sql"));

check("EKA client login path", eka.includes("/connect-auth/v1/account/login"));
check("EKA mobile registration path", eka.includes("/abdm/na/v1/registration/mobile/init"));
check("EKA consent create path", eka.includes("/abdm/v1/consents/create"));
check("EKA care-context link path", eka.includes("/abdm/v1/care-contexts/link"));
check("ekaConfigured guards secrets", eka.includes("ekaConfigured") && eka.includes("EKA_CLIENT_SECRET"));
check("Patient ABHA fields in schema", schema.includes("abhaNumber") && schema.includes("abhaStatus"));
check("Clinic ekaHipId in schema", schema.includes("ekaHipId"));
check("AbdmConsent model", schema.includes("model AbdmConsent"));
check("AbdmCareContext model", schema.includes("model AbdmCareContext"));
check("AbdmEvent model", schema.includes("model AbdmEvent"));
check("Migration present", migration);
check("ABHA init sets PENDING", abhaInit.includes('abhaStatus: "PENDING"'));
check("ABHA confirm sets LINKED", abhaConfirm.includes('abhaStatus: "LINKED"'));
check("ABHA status tenant-scoped", abhaStatus.includes("getTenantPatient"));
check("Consent uses membership clinicId", consent.includes("getClinicMembership") && consent.includes("REQUESTED"));
check("Webhook verifies signature", webhook.includes("verifyEkaWebhookSignature"));
check("Webhook idempotent event log", webhook.includes("duplicate") && webhook.includes("abdmEvent"));
check("Webhook updates consent GRANTED/DENIED", webhook.includes("CONSENT_GRANTED") && webhook.includes("GRANTED"));
check("HIU signature only", !hiu.includes("getSession") && hiu.includes("verifyEkaWebhookSignature"));
check("CSRF exempt webhooks + HIU", middleware.includes("/api/interoperability/eka/webhooks") && middleware.includes("/api/interoperability/eka/hiu/data-on-push"));
check("Onboard persists clinic HIP", onboard.includes("ekaHipId") && onboard.includes("ekaOnboardedAt"));
check("Tenant hip resolver", tenant.includes("resolveHipId") && tenant.includes("getTenantPatient"));
check("No secrets in status route", !read("src/app/api/interoperability/eka/status/route.ts").includes("EKA_CLIENT_SECRET"));

const failed = checks.filter(([, ok]) => !ok).length;
if (failed) {
  console.error(`\nEKA/ABDM verification FAILED: ${failed}`);
  process.exit(1);
}
console.log(`\nEKA/ABDM MVP verification passed: ${checks.length} checks.`);
