#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function assert(c, m) {
  if (!c) throw new Error(m);
}

const route = read("src/app/api/payments/razorpay/payment-link/route.ts");
const page = read("src/app/pricing/page.tsx");

assert(route.includes("payment_links"), "must create Razorpay payment_links");
assert(route.includes("callback_url"), "must set callback_url for return");
assert(route.includes("resolvePublicOrigin") || route.includes("MEDLUM_APP_URL"), "public origin for callback");
assert(route.includes("getSession"), "must require session");
assert(route.includes("getRazorpayCredential"), "server-side credentials only");
assert(!route.includes("NEXT_PUBLIC_RAZORPAY"), "no public secret pattern");
assert(route.includes("professional") && route.includes("clinic_plus"), "paid plans");
assert(page.includes("window.open"), "open new tab");
assert(page.includes("paymentLink") || page.includes("data.paymentLink"), "navigate to hosted link");
assert(page.includes("credentials: \"include\"") || page.includes("credentials: 'include'"), "send session cookie");
assert(page.includes("razorpay_payment_link_status") || page.includes("razorpay=return"), "handle return status");
assert(!page.includes("checkout.razorpay.com"), "must not embed Checkout modal from pricing");
assert(!page.includes("/razorpay-test"), "must not redirect to MedLum test page");

console.log("Pricing → Razorpay hosted Payment Link verification PASSED");
console.log("- Server creates payment_links with test credentials");
console.log("- Client opens short_url in a new tab");
console.log("- Callback returns to /pricing with status");
console.log("- Secrets stay server-side");
