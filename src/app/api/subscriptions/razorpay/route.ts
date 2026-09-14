import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createRazorpaySubscription, getRazorpayKeyId } from "@/lib/razorpay";
import { getClinicSubscription } from "@/lib/platform";
import { writeAudit } from "@/lib/audit";

const PLANS = {
  professional: { name: "Professional", monthly: 1999, yearly: 19990, monthlyPlanEnv: "RAZORPAY_PLAN_PROFESSIONAL_MONTHLY", yearlyPlanEnv: "RAZORPAY_PLAN_PROFESSIONAL_YEARLY" },
  clinic_plus: { name: "Clinic Plus", monthly: 4999, yearly: 49990, monthlyPlanEnv: "RAZORPAY_PLAN_CLINIC_PLUS_MONTHLY", yearlyPlanEnv: "RAZORPAY_PLAN_CLINIC_PLUS_YEARLY" },
} as const;
type PlanId = keyof typeof PLANS;
type Interval = "monthly" | "yearly";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan || "") as PlanId;
    const interval = String(body.interval || "monthly") as Interval;
    const termsAccepted = body.termsAccepted === true;
    const recurringAccepted = body.recurringAccepted === true;
    if (!(plan in PLANS) || !["monthly", "yearly"].includes(interval)) return NextResponse.json({ success: false, error: "Professional or Clinic Plus and a valid billing interval are required" }, { status: 400 });
    if (!termsAccepted || !recurringAccepted) return NextResponse.json({ success: false, error: "Please accept the Terms & Conditions and recurring auto-renewal authorization" }, { status: 400 });

    const membership = await prisma.clinicMember.findFirst({ where: { doctorId: session.doctorId, isActive: true }, include: { clinic: { select: { id: true, name: true } } } });
    if (!membership) return NextResponse.json({ success: false, error: "No active clinic is associated with this account" }, { status: 400 });
    const clinic = membership.clinic;
    const planDef = PLANS[plan];
    const amount = interval === "yearly" ? planDef.yearly : planDef.monthly;
    const planEnv = interval === "yearly" ? planDef.yearlyPlanEnv : planDef.monthlyPlanEnv;
    const razorpayPlanId = process.env[planEnv];
    if (!razorpayPlanId) return NextResponse.json({ success: false, error: `Razorpay recurring plan is not configured for ${planDef.name} ${interval}. Add ${planEnv} in the deployment environment.` }, { status: 503 });

    const existing = await getClinicSubscription(clinic.id);
    if (["ACTIVE", "PENDING", "HALTED", "PAUSED"].includes(existing.status) && existing.plan.toLowerCase().replaceAll(" ", "_") === plan) return NextResponse.json({ success: false, error: "A subscription for this plan is already active or pending" }, { status: 409 });

    const acceptedAt = new Date().toISOString();
    const subscription = await createRazorpaySubscription({
      planId: razorpayPlanId,
      totalCount: interval === "monthly" ? 120 : 10,
      notes: { clinicId: clinic.id, doctorId: session.doctorId, plan, interval, amountInr: String(amount), termsAccepted: "true", termsAcceptedAt: acceptedAt, recurringAcceptedAt: acceptedAt },
    });

    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "ClinicSubscription", entityId: clinic.id, meta: { plan: planDef.name, planId: plan, interval, amount, currency: "INR", status: "PENDING", patientLimit: plan === "clinic_plus" ? 10000 : 5000, razorpaySubscriptionId: subscription.id, razorpayPlanId, termsAcceptedAt: acceptedAt, recurringAcceptedAt: acceptedAt } });
    return NextResponse.json({ success: true, keyId: getRazorpayKeyId(), subscription: { id: subscription.id, status: subscription.status, planId: subscription.plan_id }, clinic: { id: clinic.id, name: clinic.name }, plan: { id: plan, name: planDef.name, interval, amount } });
  } catch (error) {
    console.error("create SaaS subscription", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to create subscription" }, { status: 502 });
  }
}
