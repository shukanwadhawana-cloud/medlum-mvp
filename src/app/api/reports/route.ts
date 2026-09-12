import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId: session.doctorId }, orderBy: { createdAt: "asc" } });
  if (!membership) return NextResponse.json({ error: "Clinic membership required" }, { status: 403 });
  const clinicId = membership.clinicId;
  const [patients, encounters, appointments, invoices, payments, labOrders, diagnosticOrders, prescriptions, dispensings, claims] = await Promise.all([
    prisma.patient.count({ where: { clinicId } }),
    prisma.encounter.count({ where: { patient: { clinicId } } }),
    prisma.appointment.count({ where: { patient: { clinicId } } }),
    prisma.invoice.findMany({ where: { clinicId }, select: { total: true, amount: true, status: true, createdAt: true } }),
    prisma.payment.findMany({ where: { invoice: { clinicId } }, select: { amount: true, method: true, paidAt: true } }),
    prisma.labOrder.count({ where: { patient: { clinicId } } }),
    prisma.diagnosticOrder.count({ where: { patient: { clinicId } } }),
    prisma.prescription.count({ where: { patient: { clinicId } } }),
    prisma.dispensing.count({ where: { patient: { clinicId } } }),
    prisma.insuranceClaim.findMany({ where: { clinicId }, select: { requestedAmount: true, approvedAmount: true, settledAmount: true, status: true } }),
  ]);
  const billed = invoices.reduce((s, x) => s + Number(x.total ?? x.amount ?? 0), 0);
  const collected = payments.reduce((s, x) => s + Number(x.amount || 0), 0);
  const outstanding = Math.max(0, billed - collected);
  const claimRequested = claims.reduce((s, x) => s + Number(x.requestedAmount || 0), 0);
  const claimApproved = claims.reduce((s, x) => s + Number(x.approvedAmount || 0), 0);
  const claimSettled = claims.reduce((s, x) => s + Number(x.settledAmount || 0), 0);
  const byPaymentMethod = payments.reduce((m:Record<string,number>, x) => { m[x.method] = (m[x.method] || 0) + Number(x.amount || 0); return m; }, {});
  const byInvoiceStatus = invoices.reduce((m:Record<string,number>, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
  const byClaimStatus = claims.reduce((m:Record<string,number>, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
  return NextResponse.json({ clinicId, counts: { patients, encounters, appointments, invoices: invoices.length, payments: payments.length, labOrders, diagnosticOrders, prescriptions, dispensings, claims: claims.length }, revenue: { billed, collected, outstanding }, insurance: { requested: claimRequested, approved: claimApproved, settled: claimSettled, byStatus: byClaimStatus }, paymentMethods: byPaymentMethod, invoiceStatuses: byInvoiceStatus, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
