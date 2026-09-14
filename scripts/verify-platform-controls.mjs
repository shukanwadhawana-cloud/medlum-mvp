import fs from "node:fs";

const session = fs.readFileSync("src/lib/session.ts", "utf8");
const platform = fs.readFileSync("src/lib/platform.ts", "utf8");
const legacyApi = fs.readFileSync("src/app/api/platform/route.ts", "utf8");
const controlPlane = fs.readFileSync("src/app/api/platform/control-plane/route.ts", "utf8");
const owner = fs.readFileSync("src/lib/platform-control-plane.ts", "utf8");
const ownerSession = fs.readFileSync("src/lib/platform-session.ts", "utf8");
const loginApi = fs.readFileSync("src/app/api/platform/auth/login/route.ts", "utf8");
const login = fs.readFileSync("src/app/platform/login/page.tsx", "utf8");
const dashboard = fs.readFileSync("src/app/platform/page.tsx", "utf8");
const diagnostics = fs.readFileSync("src/app/api/platform/diagnostics/route.ts", "utf8");
const env = fs.readFileSync(".env.example", "utf8");
const patients = fs.readFileSync("src/app/api/patients/route.ts", "utf8");

const requireAll = (text, tokens, label) => { for (const token of tokens) if (!text.includes(token)) throw new Error(`${label}: missing ${token}`); };
requireAll(session, ["ClinicSubscription", "SUSPENDED", "EXPIRED", "PAST_DUE", "maxAge: 0"], "session subscription enforcement");
requireAll(platform, ["PlatformAdmin", "PlatformSupport", "PlatformDeveloper", "PlatformBilling", "patientLimit"], "legacy platform roles/subscription helper");
requireAll(legacyApi, ["action === \"bootstrap\"", "MEDLUM_PLATFORM_BOOTSTRAP_SECRET", "action === \"create-user\"", "action === \"subscription\""], "legacy platform API");
requireAll(owner, ["PlatformOwner", "MEDLUM_PLATFORM_OWNER_EMAIL", "MEDLUM_PLATFORM_OWNER_PASSWORD", "ON CONFLICT (\"email\") DO NOTHING", "PlatformProduct"], "global platform owner");
requireAll(ownerSession, ["medlum_platform_session", "PLATFORM_SESSION_SECRET", "platform-owner", "ownerId"], "isolated owner session");
requireAll(loginApi, ["authenticatePlatformOwner", "createPlatformSession", "Invalid platform owner credentials"], "owner login API");
requireAll(controlPlane, ["getPlatformSession", "getPlatformProducts", "totalCollected", "mrrStatus", "productsDetail"], "control-plane dashboard API");
requireAll(patients, ["getPatientLimit", "patientLimit", "Patient limit reached"], "patient limit");
requireAll(login, ["/api/platform/auth/login", "Platform Owner Login", "separate from every hospital"], "platform owner login UI");
requireAll(dashboard, ["Platform Owner Dashboard", "Product portfolio", "MedLum MVP overview", "/api/platform/control-plane"], "control-plane dashboard UI");
requireAll(diagnostics, ["requirePlatformAccess", "database", "runtime"], "legacy developer diagnostics");
requireAll(env, ["MEDLUM_PLATFORM_OWNER_EMAIL", "MEDLUM_PLATFORM_OWNER_PASSWORD", "PLATFORM_SESSION_SECRET"], "platform owner environment contract");
console.log("Global MedLum Platform Control Plane contract: PASS");
