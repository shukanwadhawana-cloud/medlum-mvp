import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { canManagePharmacy, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { parseCareSetting } from "@/lib/patient-metadata";

function isExpired(expiryDate: string | null | undefined): boolean {
  if (!expiryDate || !String(expiryDate).trim()) return false;
  const d = new Date(String(expiryDate));
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function medicineNamesFromText(medicines: string): string[] {
  return String(medicines || "")
    .split(/[\n,;]+/)
    .map((s) => s.replace(/\d+\s*(mg|ml|tab|tabs|cap|caps|units?)?\b/gi, "").trim())
    .map((s) => s.replace(/\s{2,}/g, " ").trim())
    .filter((s) => s.length >= 2)
    .slice(0, 20);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  const clinicId = membership.clinicId;
  const memberIds = (
    await prisma.clinicMember.findMany({ where: { clinicId, isActive: true }, select: { doctorId: true } })
  ).map((m) => m.doctorId);
  const [items, prescriptions, dispensings] = await Promise.all([
    prisma.pharmacyItem.findMany({
      where: { doctorId: { in: memberIds.length ? memberIds : [session.doctorId] } },
      orderBy: { name: "asc" },
    }),
    prisma.prescription.findMany({ where: { patient: { clinicId } }, include: { patient: { select: { notes: true } } }, orderBy: { createdAt: "desc" }, take: 80 }),
    prisma.dispensing.findMany({ where: { patient: { clinicId } }, orderBy: { createdAt: "desc" }, take: 80 }),
  ]);
  return NextResponse.json({
    items: items.map((it) => ({ ...it, expired: isExpired(it.expiryDate), lowStock: it.quantity <= it.reorderLevel })),
    prescriptions: prescriptions.map((p) => ({
      id: p.id, patientId: p.patientId, patientName: p.patientName, medicines: p.medicines, advice: p.advice, isIpd: parseCareSetting(p.patient.notes) === "IPD", createdAt: p.createdAt.toISOString(),
    })),
    dispensings: dispensings.map((d) => ({
      id: d.id, patientId: d.patientId, prescriptionId: d.prescriptionId, patientName: d.patientName, medicines: d.medicines, status: d.status,
      dispensedAt: d.dispensedAt?.toISOString() || null, createdAt: d.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  try {
    const body = await req.json();
    const action = String(body.action || "");
    if (action === "inventory") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ success: false, error: "Medicine name required" }, { status: 400 });
      const quantity = Math.max(0, Math.floor(Number(body.quantity || 0)));
      const item = await prisma.pharmacyItem.create({
        data: {
          doctorId: session.doctorId, name, genericName: String(body.genericName || ""), form: String(body.form || ""),
          batchNumber: String(body.batchNumber || ""), expiryDate: String(body.expiryDate || ""),
          quantity, reorderLevel: Math.max(0, Math.floor(Number(body.reorderLevel || 0))), unit: String(body.unit || "units"),
        },
      });
      await writeAudit({ doctorId: session.doctorId, action: "create", entity: "PharmacyItem", entityId: item.id, meta: { name, quantity, batchNumber: item.batchNumber } });
      return NextResponse.json({ success: true, item: { ...item, expired: isExpired(item.expiryDate) } });
    }
    if (action === "dispense") {
      if (!canManagePharmacy(membership.role)) return NextResponse.json({ success: false, error: "Pharmacy dispensing authorization required" }, { status: 403 });
      const prescriptionId = String(body.prescriptionId || "");
      if (!prescriptionId) return NextResponse.json({ success: false, error: "Prescription required" }, { status: 400 });
      try {
        const result = await prisma.$transaction(async (tx) => {
          const prescription = await tx.prescription.findFirst({ where: { id: prescriptionId, patient: { clinicId: membership.clinicId } } });
          if (!prescription) return { status: 404, body: { success: false, error: "Prescription not found in this clinic" } };
          const existing = await tx.dispensing.findFirst({ where: { prescriptionId, patient: { clinicId: membership.clinicId } } });
          if (existing) return { status: 409, body: { success: false, error: "A dispensing record already exists for this prescription" } };
          const dispensing = await tx.dispensing.create({ data: { doctorId: session.doctorId, patientId: prescription.patientId, prescriptionId, patientName: prescription.patientName, medicines: prescription.medicines, status: "Pending" } });
          return { status: 200, body: { success: true, dispensing } };
        }, { isolationLevel: "Serializable" });
        if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });
        const dispensing = result.body.dispensing;
        if (!dispensing) return NextResponse.json({ success: false, error: "Dispensing record was not created" }, { status: 500 });
        await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Dispensing", entityId: dispensing.id, clinicId: membership.clinicId, meta: { prescriptionId, patientId: dispensing.patientId, status: "Pending", outcome: "Pending" } });
        return NextResponse.json(result.body);
      } catch (e: any) {
        if (e?.code === "P2034") return NextResponse.json({ success: false, error: "A concurrent dispensing request was detected. Please refresh the pharmacy queue." }, { status: 409 });
        throw e;
      }
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
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  try {
    const body = await req.json();
    const id = String(body.id || "");
    const action = String(body.action || "");
    if (action === "dispensing") {
      if (!canManagePharmacy(membership.role)) return NextResponse.json({ success: false, error: "Pharmacy dispensing authorization required" }, { status: 403 });
      const status = String(body.status || "Dispensed");
      if (!["Pending", "Dispensed", "Cancelled"].includes(status)) return NextResponse.json({ success: false, error: "Invalid dispensing status" }, { status: 400 });
      try {
        const result = await prisma.$transaction(async (tx) => {
          const existing = await tx.dispensing.findFirst({ where: { id, patient: { clinicId: membership.clinicId } } });
          if (!existing) return { status: 404, body: { success: false, error: "Dispensing record not found in this clinic" } };
          if (existing.status === "Dispensed") return { status: 409, body: { success: false, error: "This dispensing outcome is already recorded as Dispensed" } };
          if (existing.status === "Cancelled" && status === "Dispensed") return { status: 409, body: { success: false, error: "A cancelled dispensing record cannot be dispensed" } };
          if (status === "Dispensed") {
            const names = medicineNamesFromText(existing.medicines);
            const memberIds = (await tx.clinicMember.findMany({ where: { clinicId: membership.clinicId, isActive: true }, select: { doctorId: true } })).map((m) => m.doctorId);
            const stockItems = await tx.pharmacyItem.findMany({ where: { doctorId: { in: memberIds.length ? memberIds : [session.doctorId] } } });
            const deductions: { itemId: string; name: string; from: number; to: number }[] = [];
            for (const name of names) {
              const lower = name.toLowerCase();
              const match = stockItems.find((it) => it.quantity > 0 && !isExpired(it.expiryDate) && (it.name.toLowerCase().includes(lower) || lower.includes(it.name.toLowerCase()) || (it.genericName && it.genericName.toLowerCase().includes(lower))));
              if (!match) continue;
              const from = match.quantity, to = from - 1;
              deductions.push({ itemId: match.id, name: match.name, from, to });
            }
            for (const d of deductions) await tx.pharmacyItem.update({ where: { id: d.itemId }, data: { quantity: d.to } });
            const updated = await tx.dispensing.update({ where: { id }, data: { status: "Dispensed", dispensedAt: new Date() } });
            return { status: 200, body: { success: true, dispensing: updated, stockChanges: deductions } };
          }
          const updated = await tx.dispensing.update({ where: { id }, data: { status } });
          return { status: 200, body: { success: true, dispensing: updated, stockChanges: [] } };
        }, { isolationLevel: "Serializable" });
        if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });
        const dispensing = result.body.dispensing;
        if (!dispensing) return NextResponse.json({ success: false, error: "Dispensing record was not updated" }, { status: 500 });
        const outcome = dispensing.status;
        await writeAudit({ doctorId: session.doctorId, action: outcome === "Dispensed" ? "dispense" : "update", entity: "Dispensing", entityId: id, clinicId: membership.clinicId, meta: { status: outcome, outcome, prescriptionId: dispensing.prescriptionId, patientId: dispensing.patientId, stockChanges: result.body.stockChanges } });
        return NextResponse.json(result.body);
      } catch (e: any) {
        if (e?.code === "P2034") return NextResponse.json({ success: false, error: "A concurrent dispensing update was detected. Please refresh and reconcile the pharmacy record." }, { status: 409 });
        throw e;
      }
    }
    if (action === "inventory") {
      let item = await prisma.pharmacyItem.findFirst({ where: { id, doctorId: session.doctorId } });
      if (!item) {
        const memberIds = (
          await prisma.clinicMember.findMany({ where: { clinicId: membership.clinicId, isActive: true }, select: { doctorId: true } })
        ).map((m) => m.doctorId);
        item = await prisma.pharmacyItem.findFirst({ where: { id, doctorId: { in: memberIds } } });
      }
      if (!item) return NextResponse.json({ success: false, error: "Inventory item not found" }, { status: 404 });
      const nextQty = body.quantity === undefined ? item.quantity : Math.max(0, Math.floor(Number(body.quantity)));
      const prevQty = item.quantity;
      const updated = await prisma.pharmacyItem.update({
        where: { id: item.id },
        data: {
          quantity: nextQty,
          reorderLevel: body.reorderLevel === undefined ? item.reorderLevel : Math.max(0, Math.floor(Number(body.reorderLevel))),
          ...(body.batchNumber !== undefined ? { batchNumber: String(body.batchNumber) } : {}),
          ...(body.expiryDate !== undefined ? { expiryDate: String(body.expiryDate) } : {}),
          ...(body.name !== undefined ? { name: String(body.name).trim() || item.name } : {}),
        },
      });
      await writeAudit({
        doctorId: session.doctorId,
        action: "stock_adjust",
        entity: "PharmacyItem",
        entityId: item.id,
        meta: { previousQuantity: prevQty, newQuantity: nextQty, reason: String(body.reason || "manual adjustment").slice(0, 200) },
      });
      return NextResponse.json({ success: true, item: { ...updated, expired: isExpired(updated.expiryDate) } });
    }
    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("pharmacy patch", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
