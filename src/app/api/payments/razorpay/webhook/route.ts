import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchRazorpayOrder, fetchRazorpaySubscription, verifyWebhookSignature } from "@/lib/razorpay";
import { writeAudit } from "@/lib/audit";

const SUBSCRIPTION_EVENTS = new Set(["subscription.activated", "subscription.charged", "subscription.pending", "subscription.halted", "subscription.cancelled", "subscription.paused", "subscription.resumed"]);
const INACTIVE_SUBSCRIPTION_STATES = new Set(["halted", "cancelled", "expired"]);

function epochDate(value: number | null | undefined) {
  if (!value) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function handleSubscriptionEvent(event: string, subscriptionEntity: any) {
  const subscriptionId = String(subscriptionEntity?.id || "");
  if (!subscriptionId) return { ignored: true };
  const notes = subscriptionEntity?.notes || {};
  const clinicId = String(notes.clinicId || "");
  const doctorId = String(notes.doctorId || "");
  if (!clinicId || !doctorId) throw new Error("Razorpay subscription is missing MedLum metadata");

  const subscription = await fetchRazorpaySubscription(subscriptionId);
  const status = String(subscription.status || subscriptionEntity.status || "pending").toLowerCase();
  const planId = String(notes.plan || "");
  const planName = planId === "clinic_plus" ? "Clinic Plus" : "Professional";
  const patientLimit = planId === "clinic_plus" ? 10000 : 5000;
  const dueDate = epochDate(subscription.current_end ?? subscriptionEntity.current_end ?? null);
  const active = !INACTIVE_SUBSCRIPTION_STATES.has(status);

  await writeAudit({
    doctorId,
    action: "update",
    entity: "ClinicSubscription",
    entityId: clinicId,
    meta: {
      plan: planName,
      planId,
      interval: String(notes.interval || "monthly"),
      amount: Number(notes.amountInr || 0),
      currency: "INR",
      status: status.toUpperCase(),
      patientLimit,
      dueDate,
      razorpaySubscriptionId: subscriptionId,
      razorpayPlanId: subscription.plan_id,
      razorpayEvent: event,
      updatedAt: new Date().toISOString(),
    },
  });

  await prisma.clinic.update({ where: { id: clinicId }, data: { isActive: active, deactivatedAt: active ? null : new Date() } });
  return { subscriptionId, status, clinicId };
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return NextResponse.json({ success: false, error: "Webhook secret not configured" }, { status: 503 });
  try {
    if (!verifyWebhookSignature(rawBody, signature)) return NextResponse.json({ success: false, error: "Invalid webhook signature" }, { status: 400 });
    const payload = JSON.parse(rawBody) as any;
    const event = String(payload.event || "");

    if (SUBSCRIPTION_EVENTS.has(event)) {
      const entity = payload.payload?.subscription?.entity;
      if (!entity) return NextResponse.json({ success: true, ignored: true, event });
      return NextResponse.json({ success: true, subscription: await handleSubscriptionEvent(event, entity) });
    }

    if (!["payment.captured", "order.paid"].includes(event)) return NextResponse.json({ success: true, ignored: true, event });
    const paymentEntity = payload.payload?.payment?.entity;
    const paymentId = String(paymentEntity?.id || "");
    const orderId = String(paymentEntity?.order_id || "");
    if (!paymentId || !orderId) return NextResponse.json({ success: true, ignored: true });

    const order = await fetchRazorpayOrder(orderId);
    const invoiceId = String(order.notes?.invoiceId || "");
    const doctorId = String(order.notes?.doctorId || "");
    if (!invoiceId || !doctorId) return NextResponse.json({ success: false, error: "Razorpay order is missing MedLum metadata" }, { status: 400 });
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, doctorId }, select: { id: true, doctorId: true, patientId: true, status: true, amount: true, total: true } });
    if (!invoice) return NextResponse.json({ success: false, error: "MedLum invoice not found" }, { status: 404 });
    if (["PAID", "Paid", "paid"].includes(invoice.status)) return NextResponse.json({ success: true, alreadyPaid: true });
    const expectedAmount = Math.round(Number(invoice.total ?? invoice.amount ?? 0) * 100);
    if (order.amount !== expectedAmount || paymentEntity?.amount !== expectedAmount || paymentEntity?.currency !== "INR") return NextResponse.json({ success: false, error: "Payment amount does not match invoice" }, { status: 409 });
    const existing = await prisma.payment.findFirst({ where: { reference: paymentId }, select: { id: true } });
    if (existing) return NextResponse.json({ success: true, alreadyRecorded: true, paymentId: existing.id });
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({ data: { invoiceId: invoice.id, doctorId: invoice.doctorId, patientId: invoice.patientId, amount: expectedAmount / 100, method: "Razorpay", reference: paymentId, note: `Razorpay order ${orderId}` } });
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "Paid" } });
      return created;
    });
    await writeAudit({ doctorId, action: "create", entity: "RazorpayPayment", entityId: payment.id, meta: { invoiceId, orderId, paymentId, event, amount: expectedAmount / 100, currency: "INR" } });
    return NextResponse.json({ success: true, paymentId: payment.id });
  } catch (error) {
    console.error("Razorpay webhook", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Webhook processing failed" }, { status: 400 });
  }
}
