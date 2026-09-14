import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { fetchRazorpaySubscription, verifySubscriptionSignature } from "@/lib/razorpay";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const subscriptionId = String(body.razorpay_subscription_id || "").trim();
    const paymentId = String(body.razorpay_payment_id || "").trim();
    const signature = String(body.razorpay_signature || "").trim();
    if (!subscriptionId || !paymentId || !signature) return NextResponse.json({ success: false, error: "Subscription payment identifiers and signature are required" }, { status: 400 });
    if (!verifySubscriptionSignature(paymentId, subscriptionId, signature)) return NextResponse.json({ success: false, error: "Invalid Razorpay subscription signature" }, { status: 400 });

    const membership = await prisma.clinicMember.findFirst({ where: { doctorId: session.doctorId, isActive: true }, select: { clinicId: true } });
    if (!membership) return NextResponse.json({ success: false, error: "No active clinic is associated with this account" }, { status: 400 });
    const subscription = await fetchRazorpaySubscription(subscriptionId);
    if (subscription.notes?.clinicId !== membership.clinicId || subscription.notes?.doctorId !== session.doctorId) return NextResponse.json({ success: false, error: "Subscription does not belong to this clinic" }, { status: 403 });

    const status = String(subscription.status || "pending").toLowerCase();
    const planId = String(subscription.notes?.plan || "");
    const plan = planId === "clinic_plus" ? "Clinic Plus" : "Professional";
    const active = ["active", "authenticated"].includes(status);
    const dueDate = subscription.current_end ? new Date(subscription.current_end * 1000).toISOString() : null;
    await writeAudit({ doctorId: session.doctorId, action: "update", entity: "ClinicSubscription", entityId: membership.clinicId, meta: { plan, planId, interval: subscription.notes?.interval || "monthly", amount: Number(subscription.notes?.amountInr || 0), currency: "INR", status: status.toUpperCase(), patientLimit: planId === "clinic_plus" ? 10000 : 5000, dueDate, razorpaySubscriptionId: subscription.id, razorpayPlanId: subscription.plan_id, razorpayPaymentId: paymentId, termsAcceptedAt: subscription.notes?.termsAcceptedAt || new Date().toISOString() } });
    if (active) await prisma.clinic.update({ where: { id: membership.clinicId }, data: { isActive: true, deactivatedAt: null } });
    return NextResponse.json({ success: true, status: status.toUpperCase(), active, subscriptionId });
  } catch (error) {
    console.error("verify SaaS subscription", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Subscription verification failed" }, { status: 400 });
  }
}
