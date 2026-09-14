import fs from "node:fs";

const session = fs.readFileSync("src/lib/session.ts", "utf8");
const platform = fs.readFileSync("src/lib/platform.ts", "utf8");
const api = fs.readFileSync("src/app/api/platform/route.ts", "utf8");
const patients = fs.readFileSync("src/app/api/patients/route.ts", "utf8");
const login = fs.readFileSync("src/app/platform/login/page.tsx", "utf8");
const dashboard = fs.readFileSync("src/app/platform/page.tsx", "utf8");
const diagnostics = fs.readFileSync("src/app/api/platform/diagnostics/route.ts", "utf8");

const requireAll = (text, tokens, label) => { for (const token of tokens) if (!text.includes(token)) throw new Error(`${label}: missing ${token}`); };
requireAll(session, ["ClinicSubscription", "SUSPENDED", "EXPIRED", "PAST_DUE", "maxAge: 0"], "session subscription enforcement");
requireAll(platform, ["PlatformAdmin", "PlatformSupport", "PlatformDeveloper", "PlatformBilling", "patientLimit"], "platform roles/subscription helper");
requireAll(api, ["action === \"bootstrap\"", "MEDLUM_PLATFORM_BOOTSTRAP_SECRET", "action === \"create-user\"", "action === \"subscription\"", "PlatformUser"], "platform API");
requireAll(patients, ["getPatientLimit", "patientLimit", "Patient limit reached"], "patient limit");
requireAll(login, ["/platform", "apiLogin"], "platform login UI");
requireAll(dashboard, ["Founder Dashboard", "Manage subscription", "Create platform team login", "/api/platform"], "platform dashboard UI");
requireAll(diagnostics, ["requirePlatformAccess", "database", "runtime"], "developer diagnostics");
console.log("Platform controls contract: PASS");
