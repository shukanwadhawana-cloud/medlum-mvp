import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { cleanPatientNotes, encodePatientNotes, parseCareSetting, parsePatientProfile } from "@/lib/patient-metadata";

async function getClinicId(doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId, isActive: true }, select: { clinicId: true } });
  return membership?.clinicId || null;
}

async function getPatientLimit(clinicId: string | null) {
  if (!clinicId) return 200;
  const latest = await prisma.auditLog.findFirst({ where: { entity: "ClinicSubscription", entityId: clinicId }, orderBy: { createdAt: "desc" }, select: { meta: true } });
  if (!latest) return 200;
  try {
    const meta = JSON.parse(latest.meta || "{}");
    const n = Number(meta.patientLimit);
    return Number.isInteger(n) && n > 0 ? n : 200;
  } catch { return 200; }
}

function serialize(p: any) {
  const profile = parsePatientProfile(p.notes);
  return {
    id: p.id, doctorId: p.doctorId, name: p.name, age: p.age, gender: p.gender, phone: p.phone,
    bp: p.bp, allergies: p.allergies, notes: cleanPatientNotes(p.notes), careSetting: profile.careSetting || parseCareSetting(p.notes),
    ...profile, createdAt: p.createdAt.toISOString(),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = await getClinicId(session.doctorId);
  const patients = await prisma.patient.findMany({ where: clinicId ? { clinicId } : { doctorId: session.doctorId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ patients: patients.map(serialize), patientLimit: await getPatientLimit(clinicId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const age = parseInt(body.age, 10) || 0;
    const gender = String(body.gender || "Male");
    const phone = String(body.phone || "").trim();
    const bp = String(body.bp || "");
    const allergies = String(body.allergies || "");
    const notes = String(body.notes || "");
    const careSetting = body.careSetting === "IPD" ? "IPD" : "OPD";
    if (!name || !phone) return NextResponse.json({ success: false, error: "Name and phone required" }, { status: 400 });
    const clinicId = await getClinicId(session.doctorId);
    const limit = await getPatientLimit(clinicId);
    const count = await prisma.patient.count({ where: clinicId ? { clinicId } : { doctorId: session.doctorId } });
    if (count >= limit) return NextResponse.json({ success: false, error: `Patient limit reached (${limit}). Contact MedLum support to upgrade or renew your plan.`, patientLimit: limit, patientCount: count }, { status: 403 });
    const profile = body.profile && typeof body.profile === "object" ? { ...body.profile, careSetting } : { careSetting };
    const patient = await prisma.patient.create({ data: { doctorId: session.doctorId, clinicId, name, age, gender, phone, bp, allergies, notes: encodePatientNotes(notes, careSetting, profile) } });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Patient", entityId: patient.id, meta: { name, careSetting, profile } });
    return NextResponse.json({ success: true, patient: serialize(patient), patientLimit: limit, patientCount: count + 1 });
  } catch (e) {
    console.error("create patient", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
