import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getRazorpayCredential } from "@/lib/razorpay-config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const [keyIdConfig, keySecretConfig] = await Promise.all([
    getRazorpayCredential("RAZORPAY_KEY_ID"),
    getRazorpayCredential("RAZORPAY_KEY_SECRET"),
  ]);
  const keyId = keyIdConfig.value;
  const keySecret = keySecretConfig.value;
  if (!keyId || !keySecret) {
    return NextResponse.json({
      success: false,
      error: "Razorpay test credentials are not configured on the server",
      diagnostics: { keyId: keyIdConfig.source, keySecret: keySecretConfig.source },
    }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const amount = Math.round(Number(body.amount ?? 100));
    if (!Number.isFinite(amount) || amount < 100 || amount > 10000000) {
      return NextResponse.json({ success: false, error: "Amount must be between ₹1 and ₹1,00,000" }, { status: 400 });
    }

    const receipt = `medlum_test_${Date.now()}_${session.doctorId.slice(0, 8)}`;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount, currency: "INR", receipt, notes: { source: "MedLum Razorpay test" } }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Razorpay order creation failed", response.status, data);
      return NextResponse.json({ success: false, error: "Razorpay rejected the order request", details: data?.error?.description ?? null }, { status: 502 });
    }

    return NextResponse.json({ success: true, order: { id: data.id, amount: data.amount, currency: data.currency, receipt }, keyId });
  } catch (error) {
    console.error("Razorpay order error", error);
    return NextResponse.json({ success: false, error: "Unable to reach Razorpay" }, { status: 502 });
  }
}
