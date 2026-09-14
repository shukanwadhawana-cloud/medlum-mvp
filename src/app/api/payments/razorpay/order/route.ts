import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createRazorpayOrder } from "@/lib/razorpay";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invoiceId = String(body.invoiceId || "").trim();
  if (!invoiceId) return NextResponse.json({ success: false, error: "invoiceId required" }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, doctorId: session.doctorId },
    select: { id: true, doctorId: true, patientId: true, patientName: true, amount: true, total: true, status: true, clinicId: true },
  });
  if (!invoice) return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
  if (["PAID", "Paid", "paid"].includes(invoice.status)) return NextResponse.json({ success: false, error: "Invoice is already paid" }, { status: 409 });

  const amountRupees = Number(invoice.total ?? invoice.amount ?? 0);
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) return NextResponse.json({ success: false, error: "Invoice has an invalid amount" }, { status: 400 });
  const amountInPaise = Math.round(amountRupees * 100);
  if (amountInPaise <= 0) return NextResponse.json({ success: false, error: "Invoice amount is too small" }, { status: 400 });

  try {
    const order = await createRazorpayOrder({
      amountInPaise,
      receipt: `medlum_${invoice.id}`.slice(0, 40),
      notes: { invoiceId: invoice.id, doctorId: invoice.doctorId, patientId: invoice.patientId, clinicId: invoice.clinicId || "" },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "create",
      entity: "RazorpayOrder",
      entityId: order.id,
      meta: { invoiceId: invoice.id, clinicId: invoice.clinicId, patientId: invoice.patientId, amount: amountRupees, currency: "INR", status: order.status },
    });

    return NextResponse.json({ success: true, keyId: process.env.RAZORPAY_KEY_ID, order: { id: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt, status: order.status }, invoiceId: invoice.id, patientName: invoice.patientName });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to create Razorpay order" }, { status: 502 });
  }
}
