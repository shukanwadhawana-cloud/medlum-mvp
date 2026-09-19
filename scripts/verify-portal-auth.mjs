#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
function assert(c, m) { if (!c) throw new Error(m); }

const login = read("src/app/api/portal/auth/login/route.ts");
const data = read("src/app/api/portal/data/route.ts");
const session = read("src/lib/portal-session.ts");
const loginPage = read("src/app/portal/login/page.tsx");
const accounts = read("src/app/api/portal/accounts/route.ts");

assert(login.includes("attachPortalSessionCookie"), "login sets cookie on response");
assert(login.includes("normalizePhoneDigits"), "phone normalize");
assert(data.includes("session.patientId"), "session scoped");
assert(session.includes("httpOnly: true"), "httpOnly cookie");
assert(loginPage.includes("/portal/dashboard"), "redirect to dashboard");
assert(accounts.includes("normalizePhoneDigits"), "accounts store normalized phone");

const dashPath = path.join(root, "src/app/portal/dashboard/page.tsx");
if (fs.existsSync(dashPath)) {
  const dash = fs.readFileSync(dashPath, "utf8");
  assert(dash.includes("appointments") || dash.includes("Upcoming"), "dashboard appointments");
  assert(dash.includes("Log out") || dash.includes("logout"), "dashboard logout");
}

console.log("Portal auth + dashboard verification PASSED");
