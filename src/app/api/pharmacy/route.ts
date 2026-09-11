import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [items, prescriptions, dispensings] = await Promise.all([
    prisma.pharmacyItem.findMany({ where: { doctorId: session.doctorId }, orderBy: { name: "asc" } }),
    prisma.prescription.findMany({ where: { doctorId: session.doctorId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.dispensing.findMany({ where: { doctorId: session.doctorId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return NextResponse.json({
    items,
    prescriptions: prescriptions.map((p) => ({
      id: p.id, patientId: p.patientId, patientName: p.patientName, medicines: p.medicines, advice: p.advice, createdAt: p.createdAt.toISOString(),
    })),
    dispensings: dispensings.map((d) => ({
      id: d.id, patientId: d.patientId, prescriptionId: d.prescriptionId, patientName: d.patientName, medicines: d.medicines, status: d.status, dispensedAt: d.dispensedAt?.toISOString() || null, createdAt: d.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "inventory") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ success: false, error: "Medicine name required" }, { status: 400 });
      const item = await prisma.pharmacyItem.create({
        data: {
          doctorId: session.doctorId,
          name,
          genericName: String(body.genericName || ""),
          form: String(body.form || ""),
          batchNumber: String(body.batchNumber || ""),
          expiryDate: String(body.expiryDate || ""),
          quantity: Math.max(0, Number(body.quantity || 0)),
          reorderLevel: Math.max(0, Number(body.reorderLevel || 0)),
          unit: String(body.unit || "units"),
        },
      });
      await writeAudit({ doctorId: session.doctorId, action: "create", entity: "PharmacyItem", entityId: item.id });
      return NextResponse.json({ success: true, item });
    }

    if (action === "dispense") {
      const prescriptionId = String(body.prescriptionId || "");
      if (!prescriptionId) return NextResponse.json({ success: false, error: "Prescription required" }, { status: 400 });
      const prescription = await prisma.prescription.findFirst({ where: { id: prescriptionId, doctorId: session.doctorId } });
      if (!prescription) return NextResponse.json({ success: false, error: "Prescription not found" }, { status: 404 });
      const existing = await prisma.dispensing.findFirst({ where: { prescriptionId, doctorId: session.doctorId } });
      if (existing) return NextResponse.json({ success: true, dispensing: existing });
      const dispensing = await prisma.dispensing.create({
        data: { doctorId: session.doctorId, patientId: prescription.patientId, prescriptionId, patientName: prescription.patientName, medicines: prescription.medicines },
      });
      await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Dispensing", entityId: dispensing.id });
      return NextResponse.json({ success: true, dispensing });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("pharmacy post", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const id = String(body.id || "");
    const action = String(body.action || "");

    if (action === "dispensing") {
      const existing = await prisma.dispensing.findFirst({ where: { id, doctorId: session.doctorId } });
      if (!existing) return NextResponse.json({ success: false, error: "Dispensing record not found" }, { status: 404 });
      const status = String(body.status || "Dispensed");
      const updated = await prisma.dispensing.update({ where: { id }, data: { status, dispensedAt: status === "Dispensed" ? new Date() : null } });
      await writeAudit({ doctorId: session.doctorId, action: "update", entity: "Dispensing", entityId: id });
      return NextResponse.json({ success: true, dispensing: updated });
    }

    if (action === "inventory") {
      const existing = await prisma.pharmacyItem.findFirst({ where: { id, doctorId: session.doctorId } });
      if (!existing) return NextResponse.json({ success: false, error: "Inventory item not found" }, { status: 404 });
      const updated = await prisma.pharmacyItem.update({
        where: { id },
        data: {
          quantity: body.quantity === undefined ? existing.quantity : Math.max(0, Number(body.quantity)),
          reorderLevel: body.reorderLevel === undefined ? existing.reorderLevel : Math.max(0, Number(body.reorderLevel)),
        },
      });
      await writeAudit({ doctorId: session.doctorId, action: "update", entity: "PharmacyItem", entityId: id });
      return NextResponse.json({ success: true, item: updated });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("pharmacy patch", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
