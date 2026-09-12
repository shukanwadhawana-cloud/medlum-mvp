import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyEkaWebhookSignature } from "@/lib/interoperability/eka-webhook";
import { normalizeInteropEvent } from "@/lib/interoperability/events";

/**
 * Eka/ABDM HIU callback boundary for the result of pushed care-context data.
 *
 * This endpoint deliberately does not decrypt, persist, or expose health data.
 * The ABDM encryption/key-exchange flow must be completed before clinical data
 * is accepted into the MedLum chart.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await req.text();
  const signature = req.headers.get("Eka-Webhook-Signature");
  const secret = process.env.EKA_WEBHOOK_SIGNING_KEY || "";

  if (!verifyEkaWebhookSignature(payload, signature, secret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  try {
    const event = JSON.parse(payload) as {
      event?: string;
      transaction_id?: string;
      timestamp?: string | number;
      status?: string;
      success?: boolean;
      data?: unknown;
    };

    const normalized = normalizeInteropEvent({
      provider: "EKA_ABDM",
      event: event.event || "HEALTH_INFORMATION_RECEIVED",
      transactionId: event.transaction_id,
      timestamp: event.timestamp ? String(event.timestamp) : undefined,
      payload: event.data,
    });

    return NextResponse.json({
      accepted: true,
      provider: normalized.provider,
      kind: normalized.kind,
      transactionId: normalized.transactionId,
      status: event.status || (event.success === false ? "failed" : "accepted"),
      dataStored: false,
    }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
}
