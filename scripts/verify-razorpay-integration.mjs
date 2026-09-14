import fs from "node:fs";

const files = {
  helper: "src/lib/razorpay.ts",
  order: "src/app/api/payments/razorpay/order/route.ts",
  verify: "src/app/api/payments/razorpay/verify/route.ts",
  webhook: "src/app/api/payments/razorpay/webhook/route.ts",
  env: ".env.example",
};
for (const [name, path] of Object.entries(files)) {
  if (!fs.existsSync(path)) throw new Error(`Razorpay integration file missing: ${path}`);
  const source = fs.readFileSync(path, "utf8");
  if (!source.trim()) throw new Error(`Razorpay integration file is empty: ${path}`);
  files[name] = source;
}

const helper = files.helper;
const order = files.order;
const verify = files.verify;
const webhook = files.webhook;
const env = files.env;

const checks = [
  ["server-side Razorpay API auth", helper.includes("RAZORPAY_KEY_SECRET") && helper.includes("Authorization")],
  ["Razorpay order creation", helper.includes("/orders") && helper.includes("createRazorpayOrder")],
  ["authenticated order route", order.includes("getSession") && order.includes("invoiceId")],
  ["invoice ownership", order.includes("doctorId: session.doctorId")],
  ["payment signature verification", verify.includes("verifyPaymentSignature")],
  ["server-side order amount validation", verify.includes("order.amount !== expectedAmount")],
  ["payment idempotency", verify.includes("reference: paymentId")],
  // Payment creation is intentionally performed inside a Prisma transaction as tx.payment.create.
  ["MedLum payment persistence", /(?:prisma|tx)\.payment\.create\s*\(/.test(verify)],
  ["invoice paid state", verify.includes('status: "Paid"')],
  ["webhook signature verification", webhook.includes("verifyWebhookSignature")],
  ["webhook secret", webhook.includes("RAZORPAY_WEBHOOK_SECRET")],
  ["webhook event handling", webhook.includes("payment.captured") && webhook.includes("order.paid")],
  ["webhook idempotency", webhook.includes("reference: paymentId")],
  ["Razorpay env documentation", env.includes("RAZORPAY_KEY_ID") && env.includes("RAZORPAY_KEY_SECRET") && env.includes("RAZORPAY_WEBHOOK_SECRET")],
  ["no committed credential values", !/(RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET)\s*=\s*['\"](?!['\"])/.test(env)],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Razorpay integration verification FAILED");
  for (const name of failed) console.error(`- ${name}`);
  process.exit(1);
}
console.log(`Razorpay integration verification PASSED (${checks.length} checks)`);
