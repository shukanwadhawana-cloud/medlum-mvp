import fs from "node:fs";

const files = {
  helper: "src/lib/razorpay.ts",
  order: "src/app/api/payments/razorpay/order/route.ts",
  verify: "src/app/api/payments/razorpay/verify/route.ts",
  webhook: "src/app/api/payments/razorpay/webhook/route.ts",
  subscription: "src/app/api/subscriptions/razorpay/route.ts",
  subscriptionVerify: "src/app/api/subscriptions/razorpay/verify/route.ts",
  proForma: "src/app/api/subscriptions/pro-forma/route.ts",
  pricing: "src/app/pricing/page.tsx",
  env: ".env.example",
};
for (const [name, path] of Object.entries(files)) {
  if (!fs.existsSync(path)) throw new Error(`Razorpay integration file missing: ${path}`);
  const source = fs.readFileSync(path, "utf8");
  if (!source.trim()) throw new Error(`Razorpay integration file is empty: ${path}`);
  files[name] = source;
}
const helper=files.helper, order=files.order, verify=files.verify, webhook=files.webhook, subscription=files.subscription, subscriptionVerify=files.subscriptionVerify, proForma=files.proForma, pricing=files.pricing, env=files.env;
const checks=[
 ["server-side Razorpay API auth",helper.includes("RAZORPAY_KEY_SECRET")&&helper.includes("Authorization")],
 ["Razorpay order creation",helper.includes("/orders")&&helper.includes("createRazorpayOrder")],
 ["authenticated order route",order.includes("getSession")&&order.includes("invoiceId")],
 ["invoice ownership",order.includes("doctorId: session.doctorId")],
 ["payment signature verification",verify.includes("verifyPaymentSignature")],
 ["server-side order amount validation",verify.includes("order.amount !== expectedAmount")],
 ["payment idempotency",verify.includes("reference: paymentId")],
 ["MedLum payment persistence",/(?:prisma|tx)\.payment\.create\s*\(/.test(verify)],
 ["invoice paid state",verify.includes('status: "Paid"')],
 ["subscription API",subscription.includes("createRazorpaySubscription")&&subscription.includes("RAZORPAY_PLAN_CLINIC_PLUS_MONTHLY")],
 ["subscription authentication",subscription.includes("getSession")&&subscription.includes("termsAccepted")&&subscription.includes("recurringAccepted")],
 ["subscription audit persistence",subscription.includes('entity: "ClinicSubscription"')&&subscription.includes('status: "PENDING"')],
 ["subscription callback signature verification",subscriptionVerify.includes("verifySubscriptionSignature")],
 ["subscription ownership validation",subscriptionVerify.includes("subscription.notes?.clinicId")],
 ["pro forma PDF generation",proForma.includes("application/pdf")&&proForma.includes("SUBSCRIPTION PRO FORMA")],
 ["pricing checkout gate",pricing.includes("Generate / download pro forma PDF")&&pricing.includes("Continue to Razorpay")],
 ["terms and recurring consent",pricing.includes("termsAccepted")&&pricing.includes("recurringAccepted")&&pricing.includes("/terms")],
 ["webhook signature verification",webhook.includes("verifyWebhookSignature")],
 ["webhook secret",webhook.includes("RAZORPAY_WEBHOOK_SECRET")],
 ["subscription webhook handling",webhook.includes("subscription.activated")&&webhook.includes("subscription.cancelled")],
 ["subscription webhook activation",webhook.includes('entity: "ClinicSubscription"')&&webhook.includes("prisma.clinic.update")],
 ["webhook payment idempotency",webhook.includes("reference: paymentId")],
 ["Razorpay env documentation",env.includes("RAZORPAY_KEY_ID")&&env.includes("RAZORPAY_KEY_SECRET")&&env.includes("RAZORPAY_WEBHOOK_SECRET")&&env.includes("RAZORPAY_PLAN_CLINIC_PLUS_MONTHLY")],
 ["no committed credential values",!/(RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET)\s*=\s*['\"](?!['\"])/.test(env)],
];
const failed=checks.filter(([,ok])=>!ok).map(([name])=>name);
if(failed.length){console.error("Razorpay integration verification FAILED");for(const name of failed)console.error(`- ${name}`);process.exit(1);}
console.log(`Razorpay integration verification PASSED (${checks.length} checks)`);
