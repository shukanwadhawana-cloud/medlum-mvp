import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyEkaWebhookSignature } from "@/lib/interoperability/eka-webhook";
import { normalizeInteropEvent } from "@/lib/interoperability/events";

/** HIU callback: signature-only auth; does not decrypt or store clinical payloads. */
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

    const txn = normalized.transactionId || `hiu-${Date.now()}`;
    const payloadHash = createHash("sha256").update(payload).digest("hex").slice(0, 32);

    const existing = await prisma.abdmEvent.findUnique({
      where: { transactionId_kind: { transactionId: txn, kind: normalized.kind } },
    });
    if (existing) {
      return NextResponse.json({ accepted: true, duplicate: true, transactionId: txn }, { status: 202 });
    }

    await prisma.abdmEvent.create({
      data: {
        transactionId: txn,
        kind: normalized.kind,
        status: event.status || (event.success === false ? "failed" : "accepted"),
        payloadHash,
      },
    });

    return NextResponse.json(
      {
        accepted: true,
        provider: normalized.provider,
        kind: normalized.kind,
        transactionId: normalized.transactionId,
        status: event.status || (event.success === false ? "failed" : "accepted"),
        dataStored: false,
      },
      { status: 202 }
    );
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
}
