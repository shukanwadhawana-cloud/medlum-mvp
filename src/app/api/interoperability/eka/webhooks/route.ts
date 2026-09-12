import { NextResponse } from "next/server";
import { verifyEkaWebhookSignature } from "@/lib/interoperability/eka-webhook";

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get("Eka-Webhook-Signature");
  const secret = process.env.EKA_WEBHOOK_SIGNING_KEY || "";

  if (!verifyEkaWebhookSignature(payload, signature, secret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  try {
    const event = JSON.parse(payload) as { service?: string; event?: string; transaction_id?: string; data?: unknown };
    // Do not persist or expose clinical payloads here yet. Step 9 handlers can
    // route verified events to the appropriate provider-neutral workflow.
    return NextResponse.json({ accepted: true, event: event.event || null, transactionId: event.transaction_id || null }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
}
