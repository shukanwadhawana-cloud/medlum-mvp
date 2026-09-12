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

const statuses = ["Open", "In Treatment", "Observation", "Admitted", "Discharged", "Transferred"];
const triage = ["Resuscitation", "Emergency", "Urgent", "Less Urgent", "Non-Urgent"];

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cases = await prisma.emergencyCase.findMany({
    where: { clinicId: ctx.clinicId },
    include: { patient: { select: { id: true, name: true, phone: true } }, doctor: { select: { id: true, name: true } } },
    orderBy: { arrivalTime: "desc" },
    take: 200,
  });
  return NextResponse.json({ cases }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const patientId = body.patientId ? String(body.patientId) : null;
    if (patientId) {
      const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId } });
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found in this clinic." }, { status: 404 });
    }
    const level = triage.includes(String(body.triageLevel)) ? String(body.triageLevel) : "Urgent";
    const item = await prisma.emergencyCase.create({ data: {
      clinicId: ctx.clinicId, patientId, doctorId: ctx.session.doctorId,
      arrivalMode: String(body.arrivalMode || "Walk-in"), ambulanceProvider: String(body.ambulanceProvider || "").trim(), ambulanceNumber: String(body.ambulanceNumber || "").trim(),
      arrivalTime: body.arrivalTime ? new Date(body.arrivalTime) : new Date(), triageLevel: level, chiefComplaint: String(body.chiefComplaint || "").trim(),
      vitals: typeof body.vitals === "string" ? body.vitals : JSON.stringify(body.vitals || {}), allergies: String(body.allergies || "").trim(),
      status: "Open", disposition: "", notes: String(body.notes || "").trim(),
    } });
    await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "EMERGENCY_CASE_CREATED", entity: "EmergencyCase", entityId: item.id, meta: JSON.stringify({ clinicId: ctx.clinicId, patientId, triageLevel: level, arrivalMode: item.arrivalMode }) } });
    return NextResponse.json({ success: true, case: item });
  } catch (e) { console.error("emergency post", e); return NextResponse.json({ success: false, error: "Server error" }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json(); const id = String(body.id || "");
    if (!id) return NextResponse.json({ success: false, error: "Case id is required." }, { status: 400 });
    const existing = await prisma.emergencyCase.findFirst({ where: { id, clinicId: ctx.clinicId } });
    if (!existing) return NextResponse.json({ success: false, error: "Emergency case not found." }, { status: 404 });
    const status = statuses.includes(String(body.status)) ? String(body.status) : existing.status;
    const level = triage.includes(String(body.triageLevel)) ? String(body.triageLevel) : existing.triageLevel;
    const item = await prisma.emergencyCase.update({ where: { id }, data: {
      status, triageLevel: level,
      disposition: body.disposition === undefined ? existing.disposition : String(body.disposition),
      notes: body.notes === undefined ? existing.notes : String(body.notes),
      ambulanceProvider: body.ambulanceProvider === undefined ? existing.ambulanceProvider : String(body.ambulanceProvider),
      ambulanceNumber: body.ambulanceNumber === undefined ? existing.ambulanceNumber : String(body.ambulanceNumber),
      vitals: body.vitals === undefined ? existing.vitals : (typeof body.vitals === "string" ? body.vitals : JSON.stringify(body.vitals || {})),
      allergies: body.allergies === undefined ? existing.allergies : String(body.allergies),
      closedAt: ["Discharged", "Transferred"].includes(status) ? (existing.closedAt || new Date()) : null,
    } });
    await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "EMERGENCY_CASE_UPDATED", entity: "EmergencyCase", entityId: id, meta: JSON.stringify({ clinicId: ctx.clinicId, status, triageLevel: level }) } });
    return NextResponse.json({ success: true, case: item });
  } catch (e) { console.error("emergency patch", e); return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 }); }
}
