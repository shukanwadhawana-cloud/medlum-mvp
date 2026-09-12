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
  if (!middleware.includes(`response.headers.set("${header}"`)) {
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
if (!middleware.includes("getTrustedOrigins") || !middleware.includes("forwardedHost") || !middleware.includes("origins.has(origin)")) {
  throw new Error("External Render origin must be validated for state-changing API requests");
}

for (const token of ["httpOnly: true", "secure: process.env.NODE_ENV === \"production\"", "sameSite: \"lax\"", "maxAge: MAX_AGE"]) {
  if (!session.includes(token)) throw new Error(`Session cookie hardening missing: ${token}`);
}
if (!session.includes("SESSION_SECRET must be configured") || !session.includes("secret.length >= 32")) {
  throw new Error("Production session secret validation missing");
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
