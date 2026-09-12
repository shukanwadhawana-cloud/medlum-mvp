import { NextResponse } from "next/server";
import { verifyEkaWebhookSignature } from "@/lib/interoperability/eka-webhook";
import { normalizeInteropEvent } from "@/lib/interoperability/events";

export async function POST(req: Request) {
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
      data?: unknown;
    };

    const normalized = normalizeInteropEvent({
      provider: "EKA_ABDM",
      event: event.event,
      transactionId: event.transaction_id,
      timestamp: event.timestamp ? String(event.timestamp) : undefined,
      payload: event.data,
    });

    // Verified events are normalized at the provider boundary. Clinical payloads
    // are intentionally not persisted until the corresponding consent/data-flow
    // handler is implemented.
    return NextResponse.json({
      accepted: true,
      provider: normalized.provider,
      kind: normalized.kind,
      transactionId: normalized.transactionId,
      timestamp: normalized.timestamp,
    }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
}
