import crypto from "node:crypto";

const RAZORPAY_API = "https://api.razorpay.com/v1";

function requiredEnv(name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getRazorpayKeyId() {
  return requiredEnv("RAZORPAY_KEY_ID");
}

function authHeader() {
  const credentials = `${requiredEnv("RAZORPAY_KEY_ID")}:${requiredEnv("RAZORPAY_KEY_SECRET")}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

export type RazorpayOrder = {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  notes?: Record<string, string>;
};

export async function createRazorpayOrder(input: {
  amountInPaise: number;
  receipt: string;
  notes: Record<string, string>;
}) {
  if (!Number.isInteger(input.amountInPaise) || input.amountInPaise <= 0) throw new Error("Amount must be a positive integer in paise");
  const response = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: input.amountInPaise, currency: "INR", receipt: input.receipt, notes: input.notes }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body?.error?.description || "Razorpay order creation failed"));
  return body as RazorpayOrder;
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const expected = crypto.createHmac("sha256", requiredEnv("RAZORPAY_KEY_SECRET")).update(`${orderId}|${paymentId}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const expected = crypto.createHmac("sha256", requiredEnv("RAZORPAY_WEBHOOK_SECRET")).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
}
