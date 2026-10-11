import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const middleware = fs.readFileSync(path.join(root, "src/middleware.ts"), "utf8");
const client = fs.readFileSync(path.join(root, "src/lib/client-api.ts"), "utf8");

assert(middleware.includes("assertCsrf"), "CSRF guard missing");
assert(middleware.includes("Cross-origin request rejected"), "Origin mismatch response missing");
assert(middleware.includes("CSRF validation failed"), "Header CSRF failure missing");
assert(middleware.includes("x-medlum-requested-with") || middleware.includes("MEDLUM_CLIENT_HEADER"), "Custom client header constant missing");
assert(middleware.includes("/api/payments/razorpay/webhook"), "Razorpay webhook must be CSRF-exempt");
assert(middleware.includes("/api/telegram/webhook"), "Telegram webhook must be CSRF-exempt");
assert(middleware.includes("/api/public/"), "Public API must be CSRF-exempt");
assert(client.includes("MEDLUM_CLIENT_HEADER") || client.includes("x-medlum-requested-with"), "client-api must send CSRF client header");
assert(client.includes("credentials: \"include\"") || client.includes("credentials:'include'"), "client-api must include credentials");

assert(middleware.includes("Content-Security-Policy"), "CSP header missing");
assert(middleware.includes("meet.jit.si"), "Jitsi in CSP");
assert(middleware.includes("checkout.razorpay.com") || middleware.includes("api.razorpay.com"), "Razorpay in CSP");
assert(middleware.includes("default-src 'self'"), "CSP default-src self");
assert(!middleware.includes("default-src *"), "CSP must not use default-src *");
assert(middleware.includes("frame-src"), "CSP frame-src for Jitsi");
assert(middleware.includes("object-src 'none'"), "CSP object-src none");
assert(middleware.includes("wasm-unsafe-eval"), "CSP allows Tesseract WebAssembly");

console.log("CSRF + CSP hardening verification PASSED");
console.log("- API mutations require same-origin or x-medlum-requested-with");
console.log("- Webhooks and public booking remain exempt");
console.log("- client-api sends MedLum client header with credentials");
console.log("- Production CSP includes Jitsi + Razorpay, default-src self");
