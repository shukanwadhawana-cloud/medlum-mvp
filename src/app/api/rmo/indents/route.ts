import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

async function clinicContext(doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId, isActive: true }, select: { clinicId: true } });
  const clinicId = membership?.clinicId || null;
  const doctorIds = clinicId
    ? (await prisma.clinicMember.findMany({ where: { clinicId, isActive: true }, select: { doctorId: true } })).map(x => x.doctorId)
    : [doctorId];
  return { clinicId, doctorIds };
}

function metaOf(log: any) {
  try { return typeof log.meta === "string" ? JSON.parse(log.meta || "{}") : log.meta || {}; } catch { return {}; }
}

async function getPending(doctorId: string) {
  const { clinicId, doctorIds } = await clinicContext(doctorId);
  const logs = await prisma.auditLog.findMany({
    where: { doctorId: { in: doctorIds }, entity: "ClinicalNote" },
    orderBy: { createdAt: "desc" }, take: 1000,
  });
  const candidates = logs.map(log => ({ log, meta: metaOf(log) })).filter(x =>
    x.meta?.status === "Pending" &&
    (x.meta?.noteType === "Medication Indent" || x.meta?.noteType === "Investigation Indent") &&
    x.meta?.orderId
  );
  const patientIds = [...new Set(candidates.map(x => x.log.entityId).filter(Boolean))] as string[];
  const patients = patientIds.length ? await prisma.patient.findMany({ where: clinicId ? { id: { in: patientIds }, clinicId } : { id: { in: patientIds }, doctorId: { in: doctorIds } }, select: { id: true, name: true, roomNumber: true, notes: true } }) : [];
  const patientMap = new Map(patients.map(p => [p.id, p]));
  const prescriptionIds = candidates.filter(x => x.meta.noteType === "Medication Indent").map(x => String(x.meta.orderId));
  const labIds = candidates.filter(x => x.meta.noteType === "Investigation Indent").map(x => String(x.meta.orderId));
  const [prescriptions, labs] = await Promise.all([
    prescriptionIds.length ? prisma.prescription.findMany({ where: { id: { in: prescriptionIds }, doctorId: { in: doctorIds } } }) : [],
    labIds.length ? prisma.labOrder.findMany({ where: { id: { in: labIds }, doctorId: { in: doctorIds } } }) : [],
  ]);
  const prescriptionMap = new Map(prescriptions.map(p => [p.id, p]));
  const labMap = new Map(labs.map(l => [l.id, l]));
  return candidates.map(x => {
    const patient = patientMap.get(String(x.log.entityId));
    const orderId = String(x.meta.orderId);
    const order = x.meta.noteType === "Medication Indent" ? prescriptionMap.get(orderId) : labMap.get(orderId);
    if (!patient || !order) return null;
    return {
      id: orderId,
      type: x.meta.noteType === "Medication Indent" ? "Medication" : "Investigation",
      patientId: patient.id,
      patientName: patient.name,
      roomNumber: patient.roomNumber || "",
      description: x.meta.noteType === "Medication Indent" ? (order as any).medicines : (order as any).testName,
      notes: (order as any).notes || (order as any).advice || "",
      status: "Pending",
      createdAt: x.log.createdAt.toISOString(),
    };
  }).filter(Boolean);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ indents: await getPending(session.doctorId) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const type = String(body.type || "");
    const orderId = String(body.orderId || "");
    if (!["Medication", "Investigation"].includes(type) || !orderId) {
      return NextResponse.json({ success: false, error: "Valid indent type and orderId are required" }, { status: 400 });
    }
    const { clinicId, doctorIds } = await clinicContext(session.doctorId);
    const patientScope = clinicId ? { clinicId } : { doctorId: { in: doctorIds } };

    if (type === "Medication") {
      const prescription = await prisma.prescription.findFirst({ where: { id: orderId, doctorId: { in: doctorIds }, patient: patientScope } });
      if (!prescription) return NextResponse.json({ success: false, error: "Medication indent not found" }, { status: 404 });
      const existing = await prisma.dispensing.findFirst({ where: { prescriptionId: orderId, doctorId: { in: doctorIds } } });
      const dispensing = existing || await prisma.dispensing.create({ data: { doctorId: session.doctorId, patientId: prescription.patientId, prescriptionId: prescription.id, patientName: prescription.patientName, medicines: prescription.medicines, status: "Pending" } });
      await writeAudit({ doctorId: session.doctorId, action: "consume", entity: "MedicationIndent", entityId: orderId, meta: { patientId: prescription.patientId, dispensingId: dispensing.id, status: "Consumed", consumer: "RMO", clinicId } });
      return NextResponse.json({ success: true, consumed: { type, orderId, dispensingId: dispensing.id, status: "Consumed" } });
    }

    const lab = await prisma.labOrder.findFirst({ where: { id: orderId, doctorId: { in: doctorIds }, patient: patientScope } });
    if (!lab) return NextResponse.json({ success: false, error: "Investigation indent not found" }, { status: 404 });
    await writeAudit({ doctorId: session.doctorId, action: "consume", entity: "InvestigationIndent", entityId: orderId, meta: { patientId: lab.patientId, labOrderId: lab.id, status: "Consumed", consumer: "RMO", downstreamStatus: lab.status, clinicId } });
    return NextResponse.json({ success: true, consumed: { type, orderId, labOrderId: lab.id, status: "Consumed", downstreamStatus: lab.status } });
  } catch (e) {
    console.error("rmo indent consumer", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
