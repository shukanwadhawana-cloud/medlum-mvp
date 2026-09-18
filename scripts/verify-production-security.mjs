import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const middleware = read("src/middleware.ts");
const session = read("src/lib/session.ts");
const env = read(".env.example");

const requiredFiles = [
  "src/middleware.ts",
  "src/lib/security.ts",
  "src/lib/session.ts",
  "src/lib/session-secret.ts",
  "src/lib/rate-limit.ts",
  "src/lib/auth-config.ts",
  ".env.example",
];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing security file: ${file}`);
}

for (const header of [
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy",
]) {
  if (!middleware.includes(header)) {
    throw new Error(`Missing security header: ${header}`);
  }
}

if (!middleware.includes("Strict-Transport-Security") || !middleware.includes("NODE_ENV === \"production\"")) {
  throw new Error("Production HSTS protection missing");
}
if (!middleware.includes('pathname.startsWith("/api/")')) throw new Error("API origin protection missing");
if (!middleware.includes("req.headers.get(\"origin\")")) throw new Error("Cross-origin state-changing request check missing");
if (!middleware.includes("x-forwarded-host") || !middleware.includes("x-forwarded-proto")) {
  throw new Error("Reverse-proxy-aware origin validation missing");
}
if (!middleware.includes("getExpectedOrigin") || !middleware.includes("forwardedHost") || !middleware.includes("origin !== expectedOrigin")) {
  throw new Error("External Render origin must be validated for state-changing API requests");
}

for (const token of ["httpOnly: true", "secure: process.env.NODE_ENV === \"production\"", "sameSite: \"lax\"", "maxAge: MAX_AGE"]) {
  if (!session.includes(token)) throw new Error(`Session cookie hardening missing: ${token}`);
}
const sessionSecret = fs.readFileSync(path.join(root, "src/lib/session-secret.ts"), "utf8");
if (!sessionSecret.includes("SESSION_SECRET must be configured") || !sessionSecret.includes("secret.length < 32")) {
  throw new Error("Production session secret validation missing");
}
if (!session.includes("resolveSessionSecretBytes")) {
  throw new Error("Session must use shared resolveSessionSecretBytes helper");
}
const authConfig = fs.readFileSync(path.join(root, "src/lib/auth-config.ts"), "utf8");
if (!authConfig.includes("ALLOW_PUBLIC_SIGNUP") || !authConfig.includes("isPublicSignupAllowed")) {
  throw new Error("Production signup gate missing");
}
const signup = fs.readFileSync(path.join(root, "src/app/api/auth/signup/route.ts"), "utf8");
if (!signup.includes("isPublicSignupAllowed") || !signup.includes("consumeRateLimit")) {
  throw new Error("Signup must be gated and rate limited");
}
const login = fs.readFileSync(path.join(root, "src/app/api/auth/login/route.ts"), "utf8");
if (!login.includes("consumeRateLimit")) {
  throw new Error("Login must be rate limited");
}
if (!env.includes("ALLOW_PUBLIC_SIGNUP")) {
  throw new Error("ALLOW_PUBLIC_SIGNUP must be documented in .env.example");
}
if (!env.includes("SESSION_SECRET") || !env.includes("at-least-32-chars")) throw new Error("Secure session secret documentation missing");
if (env.includes("NEXT_PUBLIC_EKA_CLIENT_SECRET") || env.includes("NEXT_PUBLIC_EKA_API_KEY")) {
  throw new Error("EKA secrets must not be exposed through NEXT_PUBLIC variables");
}

console.log("Phase 14 production security verification passed.");
console.log("- Security headers and production HSTS");
console.log("- Cross-origin protection for state-changing API requests");
console.log("- Reverse-proxy-aware Render origin validation");
console.log("- HttpOnly/Secure/SameSite session cookie hardening");
console.log("- 32+ character production SESSION_SECRET requirement");
console.log("- Server-only EKA secret configuration");
