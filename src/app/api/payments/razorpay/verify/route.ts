import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "Razorpay credentials are not configured" }, { status: 503 });

  try {
    const body = await req.json();
    const orderId = String(body.razorpay_order_id ?? "");
    const paymentId = String(body.razorpay_payment_id ?? "");
    const signature = String(body.razorpay_signature ?? "");
    if (!orderId || !paymentId || !signature) return NextResponse.json({ success: false, error: "Incomplete Razorpay response" }, { status: 400 });

    const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    const valid = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!valid) return NextResponse.json({ success: false, error: "Razorpay signature verification failed" }, { status: 400 });

    return NextResponse.json({ success: true, verified: true, paymentId, orderId, doctorId: session.doctorId });
  } catch (error) {
    console.error("Razorpay verification error", error);
    return NextResponse.json({ success: false, error: "Invalid Razorpay response" }, { status: 400 });
  }
}
