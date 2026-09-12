import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

async function getClinicId(doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId }, select: { clinicId: true } });
  return membership?.clinicId || null;
}
async function getSharedPatient(patientId: string, doctorId: string) {
  const clinicId = await getClinicId(doctorId);
  return prisma.patient.findFirst({ where: clinicId ? { id: patientId, OR: [{ clinicId }, { doctorId }] } : { id: patientId, doctorId } });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  if (patientId && !(await getSharedPatient(patientId, session.doctorId))) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  const orders = await prisma.labOrder.findMany({ where: patientId ? { patientId } : { doctorId: session.doctorId }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ orders });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    const testName = String(body.testName || "").trim();
    if (!patientId || !testName) return NextResponse.json({ success: false, error: "Patient and test are required" }, { status: 400 });
    const patient = await getSharedPatient(patientId, session.doctorId);
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    let encounterId: string | null = body.encounterId ? String(body.encounterId) : null;
    if (encounterId) {
      // Shared patients are readable across consultants, but a clinical event may only link to the creator's encounter.
      const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, patientId, doctorId: session.doctorId } });
      if (!encounter) encounterId = null;
    }
    const order = await prisma.labOrder.create({ data: { doctorId: session.doctorId, patientId, encounterId, patientName: patient.name, testName, category: String(body.category || "Laboratory"), notes: String(body.notes || "") } });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "LabOrder", entityId: order.id, meta: { patientId, encounterId, testName } });
    return NextResponse.json({ success: true, order });
  } catch (e) {
    console.error("create lab order", e);
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
    if (!id || !["Ordered", "Collected", "Resulted", "Cancelled"].includes(status)) return NextResponse.json({ success: false, error: "Invalid update" }, { status: 400 });
    const existing = await prisma.labOrder.findFirst({ where: { id, doctorId: session.doctorId } });
    if (!existing) return NextResponse.json({ success: false, error: "Lab order not found" }, { status: 404 });
    const result = status === "Resulted" ? String(body.result || existing.result || "") : existing.result;
    const notes = body.notes === undefined ? existing.notes : String(body.notes || "");
    const order = await prisma.labOrder.update({ where: { id }, data: { status, result, notes, resultedAt: status === "Resulted" ? new Date() : existing.resultedAt } });
    await writeAudit({ doctorId: session.doctorId, action: "update", entity: "LabOrder", entityId: id, meta: { status } });
    return NextResponse.json({ success: true, order });
  } catch (e) {
    console.error("update lab order", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
