import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership, canViewBillingDetail, findAuthorizedPatient } from "@/lib/clinic-auth";

function denyUnlessBilling(role: string) {
  if (!canViewBillingDetail(role as any)) {
    return NextResponse.json({ success: false, error: "Billing access restricted to Owner, Admin, Receptionist, or Billing roles." }, { status: 403 });
  }
  return null;
}

async function clinicForDoctor(doctorId: string) {
  // Prefer selected clinic membership (facility isolation); never trust client clinicId.
  const membership = await requireActiveClinicMembership(doctorId);
  if (!membership) return null;
  return { clinicId: membership.clinicId, role: membership.role };
}

async function sharedPatient(patientId: string, doctorId: string) {
  const membership = await requireActiveClinicMembership(doctorId);
  if (!membership) return null;
  return findAuthorizedPatient(membership, patientId);
}

async function nextInvoiceNumber(clinicId: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `INV-${day}-`;
  const last = await prisma.invoice.findFirst({
    where: { clinicId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  let seq = 1;
  if (last?.invoiceNumber) {
    const parts = last.invoiceNumber.split("-");
    const n = parseInt(parts[parts.length - 1] || "0", 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const member = await clinicForDoctor(session.doctorId);
  if (!member) return NextResponse.json({ invoices: [] });
  const denied = denyUnlessBilling(member.role);
  if (denied) return denied;
  const list = await prisma.invoice.findMany({
    where: { clinicId: member.clinicId },
    include: { items: { orderBy: { createdAt: "asc" } }, payments: { orderBy: { paidAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  const patientIds = [...new Set(list.map((i) => i.patientId))];
  const patientRows = patientIds.length ? await prisma.patient.findMany({
    where: { clinicId: member.clinicId, id: { in: patientIds }, deletedAt: null },
    select: { id: true, status: true },
  }) : [];
  const patientStatus = new Map(patientRows.map((p) => [p.id, p.status]));
  return NextResponse.json({
    invoices: list.map((i) => {
      const total = Number(i.total ?? i.amount);
      const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
      const balance = Math.max(0, total - paid);
      const discharged = patientStatus.get(i.patientId) === "DISCHARGED";
      const billingStatus = balance > 0.0001 ? "BILLING_PENDING" : "BILLING_CLEARED";
      return {
        id: i.id,
        doctorId: i.doctorId,
        patientId: i.patientId,
        patientName: i.patientName,
        amount: i.amount,
        subtotal: i.subtotal,
        discount: i.discount,
        tax: i.tax,
        total,
        status: i.status,
        invoiceNumber: i.invoiceNumber,
        tariffVersionId: i.tariffVersionId,
        tariffVersionName: i.tariffVersionName,
        note: i.note,
        dueDate: i.dueDate?.toISOString() || null,
        createdAt: i.createdAt.toISOString(),
        items: i.items,
        payments: i.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          method: p.method,
          paidAt: p.paidAt.toISOString(),
          reference: p.reference,
          note: p.note,
          doctorId: p.doctorId,
        })),
        paid,
        balance,
        billingStatus,
        dischargedBillingPending: discharged && billingStatus === "BILLING_PENDING",
        dischargedBillingCleared: discharged && billingStatus === "BILLING_CLEARED",
      };
    }),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    const member = await clinicForDoctor(session.doctorId);
    if (!member || !(await sharedPatient(patientId, session.doctorId))) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }
    const denied = denyUnlessBilling(member.role);
    if (denied) return denied;
    const patient = await sharedPatient(patientId, session.doctorId);

    const activeTariff = await prisma.tariffVersion.findFirst({
      where: { clinicId: member.clinicId, isActive: true },
      include: { items: true },
    });
    const byCode = new Map<string, any>();
    const byId = new Map<string, any>();
    if (activeTariff) {
      for (const it of activeTariff.items) {
        if (it.code) byCode.set(it.code.toLowerCase(), it);
        byId.set(it.id, it);
      }
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems
      .map((x: any) => {
        const description = String(x.description || x.name || "").trim();
        const code = String(x.code || "").trim();
        const tariffItemId = String(x.tariffItemId || "").trim();
        let unitPrice = Number(x.unitPrice);
        let category = String(x.category || "Service");
        let matched: {
          id: string;
          code: string;
          name: string;
          category: string;
          unitPrice: number;
          esicCode: string;
          esicCategory: string;
        } | null = null;
        if (tariffItemId && byId.has(tariffItemId)) matched = byId.get(tariffItemId)!;
        else if (code && byCode.has(code.toLowerCase())) matched = byCode.get(code.toLowerCase())!;
        if (matched) {
          if (!Number.isFinite(unitPrice) || unitPrice < 0) unitPrice = matched.unitPrice;
          if (!category || category === "Service") category = matched.category || category;
        }
        const quantity = Number(x.quantity || 1);
        return {
          description: description || matched?.name || "",
          category,
          code: code || matched?.code || "",
          quantity,
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          tariffItemId: matched?.id || tariffItemId || "",
          esicRate: matched ? matched.unitPrice : (null as number | null),
          matched,
        };
      })
      .filter((x: any) => x.description && x.quantity > 0 && x.unitPrice >= 0);

    if (!items.length) {
      return NextResponse.json({ success: false, error: "At least one invoice item is required" }, { status: 400 });
    }

    const subtotal = items.reduce((s: number, x: any) => s + x.quantity * x.unitPrice, 0);
    const discount = Math.max(0, Number(body.discount || 0));
    const tax = Math.max(0, Number(body.tax || 0));
    const total = Math.max(0, subtotal - discount + tax);
    if (total <= 0) {
      return NextResponse.json({ success: false, error: "Invoice total must be greater than zero" }, { status: 400 });
    }

    const invoiceNumber = await nextInvoiceNumber(member.clinicId);
    const inv = await prisma.invoice.create({
      data: {
        doctorId: session.doctorId,
        patientId,
        patientName: patient!.name,
        clinicId: member.clinicId,
        amount: total,
        subtotal,
        discount,
        tax,
        total,
        status: "Pending",
        invoiceNumber,
        tariffVersionId: activeTariff?.id || "",
        tariffVersionName: activeTariff ? `${activeTariff.name} ${activeTariff.version}` : "",
        note: String(body.note || ""),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        items: {
          create: items.map((x: any) => {
            const amount = x.quantity * x.unitPrice;
            const snap = {
              tariffVersionId: activeTariff?.id || null,
              tariffVersionName: activeTariff ? `${activeTariff.name} ${activeTariff.version}` : null,
              tariffItemId: x.matched?.id || x.tariffItemId || null,
              code: x.code || null,
              name: x.description,
              category: x.category,
              unitPrice: x.unitPrice,
              esicCode: x.matched?.esicCode || null,
              esicCategory: x.matched?.esicCategory || null,
              quantity: x.quantity,
              amount,
              snapshottedAt: new Date().toISOString(),
            };
            return {
              description: x.description,
              category: x.category,
              code: x.code,
              quantity: x.quantity,
              unitPrice: x.unitPrice,
              esicRate: x.esicRate,
              billedRate: x.unitPrice,
              amount,
              tariffVersionId: activeTariff?.id || "",
              tariffItemId: x.matched?.id || x.tariffItemId || "",
              snapshotJson: JSON.stringify(snap),
            };
          }),
        },
      },
      include: { items: true, payments: true },
    });

    await writeAudit({
      doctorId: session.doctorId,
      clinicId: member.clinicId,
      action: "create",
      entity: "Invoice",
      entityId: inv.id,
      meta: {
        total,
        subtotal,
        discount,
        tax,
        itemCount: items.length,
        invoiceNumber,
        tariffVersionId: activeTariff?.id || null,
      },
    });
    return NextResponse.json({ success: true, invoice: inv });
  } catch (e) {
    console.error("create invoice", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const id = String(body.id || "");
    const action = String(body.action || "");
    const member = await clinicForDoctor(session.doctorId);
    if (!member) return NextResponse.json({ success: false, error: "Clinic not found" }, { status: 403 });
    const denied = denyUnlessBilling(member.role);
    if (denied) return denied;
    const existing = await prisma.invoice.findFirst({
      where: { id, clinicId: member.clinicId },
      include: { payments: true },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    const total = Number(existing.total ?? existing.amount);

    if (action === "payment") {
      if (existing.status === "Cancelled") {
        return NextResponse.json(
          { success: false, error: "Cannot record payment against a cancelled invoice" },
          { status: 400 }
        );
      }
      if (existing.status === "Paid") {
        return NextResponse.json({ success: false, error: "Invoice is already fully paid" }, { status: 400 });
      }
      const amount = Number(body.amount || 0);
      if (!(amount > 0) || !Number.isFinite(amount)) {
        return NextResponse.json({ success: false, error: "Enter a valid payment" }, { status: 400 });
      }
      const alreadyPaid = existing.payments.reduce((s, p) => s + Number(p.amount), 0);
      const balance = total - alreadyPaid;
      if (amount > balance + 0.0001) {
        return NextResponse.json(
          { success: false, error: `Payment exceeds remaining balance of ₹${balance.toFixed(2)}` },
          { status: 400 }
        );
      }
      const reference = String(body.reference || "").trim() || null;
      if (reference) {
        const since = new Date(Date.now() - 60_000);
        const dup = existing.payments.find(
          (p) => p.reference === reference && p.paidAt >= since && Math.abs(Number(p.amount) - amount) < 0.01
        );
        if (dup) {
          return NextResponse.json(
            { success: false, error: "Duplicate payment reference within 60s" },
            { status: 409 }
          );
        }
      }
      const payment = await prisma.payment.create({
        data: {
          invoiceId: id,
          doctorId: session.doctorId,
          patientId: existing.patientId,
          amount,
          method: String(body.method || "Cash"),
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          reference,
          note: String(body.note || "") || null,
        },
      });
      const newPaid = alreadyPaid + amount;
      const status = newPaid >= total - 0.0001 ? "Paid" : "Partially Paid";
      const updated = await prisma.invoice.update({
        where: { id },
        data: { status },
        include: { items: true, payments: true },
      });
      await writeAudit({
        doctorId: session.doctorId,
        clinicId: member.clinicId,
        action: "payment",
        entity: "Invoice",
        entityId: id,
        meta: { paymentId: payment.id, amount, method: payment.method, status, reference },
      });
      return NextResponse.json({ success: true, invoice: updated, payment });
    }

    if (action === "status") {
      const status = String(body.status || "");
      if (!["Pending", "Partially Paid", "Paid", "Cancelled"].includes(status)) {
        return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
      }
      const updated = await prisma.invoice.update({
        where: { id },
        data: { status },
        include: { items: true, payments: true },
      });
      await writeAudit({
        doctorId: session.doctorId,
        clinicId: member.clinicId,
        action: "update_status",
        entity: "Invoice",
        entityId: id,
        meta: { status },
      });
      return NextResponse.json({ success: true, invoice: updated });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("patch invoice", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
