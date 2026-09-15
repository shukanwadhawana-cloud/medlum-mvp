import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getRazorpayCredential } from "@/lib/razorpay-config";

export const runtime = "nodejs";

const plans = {
  professional: { monthly: 1999, yearly: 19990 },
  clinic_plus: { monthly: 4999, yearly: 49990 },
} as const;

type PlanId = keyof typeof plans;
type Interval = keyof (typeof plans)["professional"];

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
    const plan = String(body.plan ?? "") as PlanId;
    const interval = String(body.interval ?? "monthly") as Interval;
    if (!(plan in plans) || !(interval in plans[plan])) {
      return NextResponse.json({ success: false, error: "Invalid paid plan or billing interval" }, { status: 400 });
    }

    const amountInr = plans[plan][interval];
    const amount = amountInr * 100;
    const referenceId = `medlum_${plan}_${interval}_${Date.now()}`.slice(0, 40);
    const origin = new URL(req.url).origin;

    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        accept_partial: false,
        reference_id: referenceId,
        description: `MedLum ${plan === "professional" ? "Professional" : "Clinic Plus"} ${interval} Test Payment`,
        notes: { source: "MedLum pricing test", plan, interval, doctorId: session.doctorId },
        callback_url: `${origin}/pricing?razorpay=success&plan=${plan}&interval=${interval}`,
        callback_method: "get",
      }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.short_url) {
      console.error("Razorpay payment link creation failed", response.status, data);
      return NextResponse.json({
        success: false,
        error: "Razorpay rejected the payment-link request",
        details: data?.error?.description ?? null,
      }, { status: 502 });
    }

    return NextResponse.json({ success: true, paymentLink: data.short_url, amountInr, referenceId });
  } catch (error) {
    console.error("Razorpay payment link error", error);
    return NextResponse.json({ success: false, error: "Unable to reach Razorpay" }, { status: 502 });
  }
}
