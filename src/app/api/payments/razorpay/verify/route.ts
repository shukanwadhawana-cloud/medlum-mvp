import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { fetchRazorpayOrder, verifyPaymentSignature } from "@/lib/razorpay";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const invoiceId = String(body.invoiceId || "").trim();
  const orderId = String(body.razorpay_order_id || "").trim();
  const paymentId = String(body.razorpay_payment_id || "").trim();
  const signature = String(body.razorpay_signature || "").trim();
  if (!invoiceId || !orderId || !paymentId || !signature) return NextResponse.json({ success: false, error: "invoiceId, Razorpay payment identifiers and signature are required" }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, doctorId: session.doctorId }, select: { id: true, doctorId: true, patientId: true, patientName: true, amount: true, total: true, status: true, clinicId: true } });
  if (!invoice) return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
  if (["PAID", "Paid", "paid"].includes(invoice.status)) return NextResponse.json({ success: true, alreadyPaid: true, invoiceId: invoice.id });

  try {
    if (!verifyPaymentSignature(orderId, paymentId, signature)) return NextResponse.json({ success: false, error: "Invalid Razorpay payment signature" }, { status: 400 });
    const order = await fetchRazorpayOrder(orderId);
    const expectedAmount = Math.round(Number(invoice.total ?? invoice.amount ?? 0) * 100);
    if (order.amount !== expectedAmount || order.currency !== "INR") return NextResponse.json({ success: false, error: "Razorpay order amount does not match invoice" }, { status: 409 });
    if (!order.notes || order.notes.invoiceId !== invoice.id || order.notes.doctorId !== invoice.doctorId) return NextResponse.json({ success: false, error: "Razorpay order does not belong to this invoice" }, { status: 403 });
    if (order.status !== "paid" && order.amount_paid < order.amount) return NextResponse.json({ success: false, error: "Razorpay order is not paid" }, { status: 409 });

    const existing = await prisma.payment.findFirst({ where: { reference: paymentId }, select: { id: true } });
    if (existing) return NextResponse.json({ success: true, alreadyRecorded: true, paymentId: existing.id, invoiceId: invoice.id });

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({ data: { invoiceId: invoice.id, doctorId: invoice.doctorId, patientId: invoice.patientId, amount: expectedAmount / 100, method: "Razorpay", reference: paymentId, note: `Razorpay order ${orderId}` } });
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "Paid" } });
      return created;
    });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "RazorpayPayment", entityId: payment.id, meta: { invoiceId: invoice.id, orderId, paymentId, amount: expectedAmount / 100, currency: "INR" } });
    return NextResponse.json({ success: true, paymentId: payment.id, invoiceId: invoice.id, status: "Paid" });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Payment verification failed" }, { status: 502 });
  }
}
