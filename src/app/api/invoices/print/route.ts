import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

/** Printable invoice payload with hospital branding + snapshotted line items (never live tariff). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id, clinicId: membership.clinicId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { paidAt: "asc" } },
      patient: { select: { id: true, name: true, phone: true, age: true, gender: true, registrationNo: true, uhid: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: {
      name: true,
      address: true,
      phone: true,
      email: true,
      logoUrl: true,
      website: true,
      invoiceFooter: true,
      registrationNo: true,
      letterheadHeightMm: true,
      showMedlumFooter: true,
    },
  });

  const total = Number(invoice.total ?? invoice.amount);
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);

  const lines = invoice.items.map((it) => {
    let snap: Record<string, unknown> = {};
    try {
      snap = JSON.parse(it.snapshotJson || "{}");
    } catch {
      snap = {};
    }
    return {
      description: it.description,
      category: it.category,
      code: it.code,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      billedRate: it.billedRate ?? it.unitPrice,
      esicRate: it.esicRate,
      amount: it.amount,
      tariffVersionId: it.tariffVersionId,
      snapshot: snap,
    };
  });

  return NextResponse.json({
    printable: {
      hospital: clinic,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        patientName: invoice.patientName,
        patient: invoice.patient,
        note: invoice.note,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        tax: invoice.tax,
        total,
        paid,
        balance: Math.max(0, total - paid),
        tariffVersionId: invoice.tariffVersionId,
        tariffVersionName: invoice.tariffVersionName,
        createdAt: invoice.createdAt.toISOString(),
        dueDate: invoice.dueDate?.toISOString() || null,
      },
      lines,
      payments: invoice.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        reference: p.reference,
        note: p.note,
      })),
    },
  });
}
