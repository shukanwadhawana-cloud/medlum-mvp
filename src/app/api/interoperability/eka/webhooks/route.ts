import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
      consent_init_id?: string;
      timestamp?: string | number;
      data?: unknown;
      status?: string;
    };

    const normalized = normalizeInteropEvent({
      provider: "EKA_ABDM",
      event: event.event,
      transactionId: event.transaction_id || event.consent_init_id,
      timestamp: event.timestamp ? String(event.timestamp) : undefined,
      payload: event.data,
    });

    const txn = normalized.transactionId || `unknown-${Date.now()}`;
    const payloadHash = createHash("sha256").update(payload).digest("hex").slice(0, 32);

    const existing = await prisma.abdmEvent.findUnique({
      where: { transactionId_kind: { transactionId: txn, kind: normalized.kind } },
    });
    if (existing) {
      return NextResponse.json(
        { accepted: true, duplicate: true, kind: normalized.kind, transactionId: txn },
        { status: 202 }
      );
    }

    await prisma.abdmEvent.create({
      data: {
        transactionId: txn,
        kind: normalized.kind,
        status: "RECEIVED",
        payloadHash,
      },
    });

    const consentStatusMap: Record<string, string> = {
      CONSENT_REQUESTED: "PENDING",
      CONSENT_GRANTED: "GRANTED",
      CONSENT_DENIED: "DENIED",
    };
    const nextStatus = consentStatusMap[normalized.kind];
    if (nextStatus) {
      const consent =
        (await prisma.abdmConsent.findFirst({
          where: { consentInitId: txn },
          orderBy: { createdAt: "desc" },
        })) ||
        (await prisma.abdmConsent.findFirst({
          where: { txnId: txn },
          orderBy: { createdAt: "desc" },
        }));
      if (consent) {
        await prisma.abdmConsent.update({
          where: { id: consent.id },
          data: { status: nextStatus, txnId: txn },
        });
        await prisma.abdmEvent.update({
          where: { transactionId_kind: { transactionId: txn, kind: normalized.kind } },
          data: { clinicId: consent.clinicId, status: nextStatus },
        });
      }
    }

    if (normalized.kind === "CARE_CONTEXT_LINKED") {
      await prisma.abdmCareContext.updateMany({
        where: { ekaReference: txn },
        data: { linkStatus: "LINKED", linkedAt: new Date() },
      });
    }

    return NextResponse.json(
      {
        accepted: true,
        provider: normalized.provider,
        kind: normalized.kind,
        transactionId: normalized.transactionId,
        timestamp: normalized.timestamp,
      },
      { status: 202 }
    );
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
}
