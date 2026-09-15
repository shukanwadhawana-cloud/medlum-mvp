import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 503 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const valid = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });

  try {
    const event = JSON.parse(rawBody);
    console.log("Razorpay webhook received", event.event, event.payload?.payment?.entity?.id ?? event.payload?.order?.entity?.id ?? "");
    // Payment reconciliation is intentionally kept separate from checkout verification.
    // Once invoice/order mapping is enabled, handle payment.captured/order.paid here.
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
