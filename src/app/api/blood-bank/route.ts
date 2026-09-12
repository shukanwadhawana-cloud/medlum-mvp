import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

async function getContext() {
  const session = await getSession();
  if (!session) return null;
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId: session.doctorId }, orderBy: { createdAt: "asc" } });
  if (!membership) return null;
  return { session, clinicId: membership.clinicId };
}

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [inventory, donors, requests] = await Promise.all([
    prisma.bloodInventory.findMany({ where: { clinicId: ctx.clinicId }, orderBy: [{ bloodGroup: "asc" }, { component: "asc" }, { expiryDate: "asc" }] }),
    prisma.bloodDonor.findMany({ where: { clinicId: ctx.clinicId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.bloodRequest.findMany({ where: { clinicId: ctx.clinicId }, include: { patient: { select: { id: true, name: true, phone: true } }, inventory: { select: { id: true, bloodGroup: true, component: true, batchNumber: true } } }, orderBy: { requestedAt: "desc" }, take: 100 }),
  ]);
  return NextResponse.json({ inventory, donors, requests }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "inventory") {
      const bloodGroup = String(body.bloodGroup || "").trim();
      const component = String(body.component || "").trim();
      const units = Math.max(0, Math.floor(Number(body.unitsAvailable || 0)));
      if (!bloodGroup || !component) return NextResponse.json({ success: false, error: "Blood group and component are required." }, { status: 400 });
      const item = await prisma.bloodInventory.create({ data: { clinicId: ctx.clinicId, bloodGroup, component, unitsAvailable: units, batchNumber: String(body.batchNumber || "").trim(), expiryDate: body.expiryDate ? new Date(body.expiryDate) : null, storageLocation: String(body.storageLocation || "").trim(), notes: String(body.notes || "").trim() } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "BLOOD_INVENTORY_CREATED", entity: "BloodInventory", entityId: item.id, meta: JSON.stringify({ clinicId: ctx.clinicId, bloodGroup, component, units }) } });
      return NextResponse.json({ success: true, item });
    }

    if (action === "donor") {
      const name = String(body.name || "").trim();
      const bloodGroup = String(body.bloodGroup || "").trim();
      if (!name || !bloodGroup) return NextResponse.json({ success: false, error: "Donor name and blood group are required." }, { status: 400 });
      const donor = await prisma.bloodDonor.create({ data: { clinicId: ctx.clinicId, name, bloodGroup, phone: String(body.phone || "").trim(), donorCode: String(body.donorCode || "").trim(), lastDonationDate: body.lastDonationDate ? new Date(body.lastDonationDate) : null, status: String(body.status || "Eligible"), notes: String(body.notes || "").trim() } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "BLOOD_DONOR_CREATED", entity: "BloodDonor", entityId: donor.id, meta: JSON.stringify({ clinicId: ctx.clinicId, bloodGroup }) } });
      return NextResponse.json({ success: true, donor });
    }

    if (action === "request") {
      const patientId = String(body.patientId || "");
      const bloodGroup = String(body.bloodGroup || "").trim();
      const component = String(body.component || "").trim();
      const unitsRequested = Math.max(1, Math.floor(Number(body.unitsRequested || 1)));
      if (!patientId || !bloodGroup || !component) return NextResponse.json({ success: false, error: "Patient, blood group and component are required." }, { status: 400 });
      const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId } });
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found in this clinic." }, { status: 404 });
      const request = await prisma.bloodRequest.create({ data: { clinicId: ctx.clinicId, patientId, doctorId: ctx.session.doctorId, bloodGroup, component, unitsRequested, urgency: String(body.urgency || "Routine"), crossMatchStatus: String(body.crossMatchStatus || "Not Started"), notes: String(body.notes || "").trim() } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "BLOOD_REQUEST_CREATED", entity: "BloodRequest", entityId: request.id, meta: JSON.stringify({ clinicId: ctx.clinicId, patientId, bloodGroup, component, unitsRequested }) } });
      return NextResponse.json({ success: true, request });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("blood bank post", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const action = String(body.action || "");
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ success: false, error: "Record id is required." }, { status: 400 });

    if (action === "inventory") {
      const existing = await prisma.bloodInventory.findFirst({ where: { id, clinicId: ctx.clinicId } });
      if (!existing) return NextResponse.json({ success: false, error: "Blood inventory record not found." }, { status: 404 });
      const available = body.unitsAvailable === undefined ? existing.unitsAvailable : Math.max(0, Math.floor(Number(body.unitsAvailable)));
      const reserved = body.unitsReserved === undefined ? existing.unitsReserved : Math.max(0, Math.floor(Number(body.unitsReserved)));
      if (reserved > available) return NextResponse.json({ success: false, error: "Reserved units cannot exceed available units." }, { status: 400 });
      const item = await prisma.bloodInventory.update({ where: { id }, data: { unitsAvailable: available, unitsReserved: reserved, status: String(body.status || existing.status), storageLocation: body.storageLocation === undefined ? existing.storageLocation : String(body.storageLocation), notes: body.notes === undefined ? existing.notes : String(body.notes) } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "BLOOD_INVENTORY_UPDATED", entity: "BloodInventory", entityId: id, meta: JSON.stringify({ clinicId: ctx.clinicId, available, reserved }) } });
      return NextResponse.json({ success: true, item });
    }

    if (action === "request") {
      const existing = await prisma.bloodRequest.findFirst({ where: { id, clinicId: ctx.clinicId } });
      if (!existing) return NextResponse.json({ success: false, error: "Blood request not found." }, { status: 404 });
      const status = String(body.status || existing.status);
      const crossMatchStatus = String(body.crossMatchStatus || existing.crossMatchStatus);
      const inventoryId = body.inventoryId === undefined ? existing.inventoryId : (body.inventoryId ? String(body.inventoryId) : null);
      let fulfilledAt = existing.fulfilledAt;
      if (status === "Fulfilled" && existing.status !== "Fulfilled") {
        if (!inventoryId) return NextResponse.json({ success: false, error: "Select an inventory batch before fulfilling the request." }, { status: 400 });
        const inventory = await prisma.bloodInventory.findFirst({ where: { id: inventoryId, clinicId: ctx.clinicId, bloodGroup: existing.bloodGroup, component: existing.component } });
        if (!inventory) return NextResponse.json({ success: false, error: "Matching blood inventory batch not found." }, { status: 404 });
        const freeUnits = inventory.unitsAvailable - inventory.unitsReserved;
        if (freeUnits < existing.unitsRequested) return NextResponse.json({ success: false, error: "Not enough free units in the selected batch." }, { status: 400 });
        await prisma.bloodInventory.update({ where: { id: inventory.id }, data: { unitsAvailable: { decrement: existing.unitsRequested }, status: inventory.unitsAvailable - existing.unitsRequested === 0 ? "Depleted" : inventory.status } });
        fulfilledAt = new Date();
      }
      const request = await prisma.bloodRequest.update({ where: { id }, data: { status, crossMatchStatus, inventoryId, fulfilledAt } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "BLOOD_REQUEST_UPDATED", entity: "BloodRequest", entityId: id, meta: JSON.stringify({ clinicId: ctx.clinicId, status, crossMatchStatus, inventoryId }) } });
      return NextResponse.json({ success: true, request });
    }

    if (action === "donor") {
      const existing = await prisma.bloodDonor.findFirst({ where: { id, clinicId: ctx.clinicId } });
      if (!existing) return NextResponse.json({ success: false, error: "Donor not found." }, { status: 404 });
      const donor = await prisma.bloodDonor.update({ where: { id }, data: { status: body.status === undefined ? existing.status : String(body.status), phone: body.phone === undefined ? existing.phone : String(body.phone), notes: body.notes === undefined ? existing.notes : String(body.notes), lastDonationDate: body.lastDonationDate === undefined ? existing.lastDonationDate : (body.lastDonationDate ? new Date(body.lastDonationDate) : null) } });
      return NextResponse.json({ success: true, donor });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("blood bank patch", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
