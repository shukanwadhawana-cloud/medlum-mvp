import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.invoice.findMany({
    where: { doctorId: session.doctorId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    invoices: list.map((i) => ({
      id: i.id,
      doctorId: i.doctorId,
      patientId: i.patientId,
      patientName: i.patientName,
      amount: i.amount,
      status: i.status,
      note: i.note,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    const amount = parseFloat(body.amount) || 0;
    const note = String(body.note || "");
    if (!patientId || amount <= 0) {
      return NextResponse.json({ success: false, error: "Patient and amount required" }, { status: 400 });
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, doctorId: session.doctorId },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    const inv = await prisma.invoice.create({
      data: {
        doctorId: session.doctorId,
        patientId,
        patientName: patient.name,
        amount,
        status: "Pending",
        note,
      },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "create",
      entity: "Invoice",
      entityId: inv.id,
      meta: { amount },
    });

    return NextResponse.json({
      success: true,
      invoice: {
        id: inv.id,
        doctorId: inv.doctorId,
        patientId: inv.patientId,
        patientName: inv.patientName,
        amount: inv.amount,
        status: inv.status,
        note: inv.note,
        createdAt: inv.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("create invoice", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!id || !status) {
      return NextResponse.json({ success: false, error: "id and status required" }, { status: 400 });
    }

    const existing = await prisma.invoice.findFirst({
      where: { id, doctorId: session.doctorId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "update_status",
      entity: "Invoice",
      entityId: id,
      meta: { status },
    });

    return NextResponse.json({ success: true, invoice: updated });
  } catch (e) {
    console.error("patch invoice", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
