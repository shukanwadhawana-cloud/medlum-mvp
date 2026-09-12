import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

const CARE_MARKER = /(?:^|\n)__MEDLUM_CARE_SETTING__:(OPD|IPD)\n?/;

function parseCareSetting(notes: string) {
  const match = String(notes || "").match(CARE_MARKER);
  return match?.[1] === "IPD" ? "IPD" : "OPD";
}

function cleanNotes(notes: string) {
  return String(notes || "").replace(CARE_MARKER, "").trim();
}

function encodeNotes(notes: string, careSetting: "OPD" | "IPD") {
  return `__MEDLUM_CARE_SETTING__:${careSetting}\n${cleanNotes(notes)}`.trim();
}

async function getClinicId(doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId }, select: { clinicId: true } });
  return membership?.clinicId || null;
}

function serialize(p: any) {
  return {
    id: p.id, doctorId: p.doctorId, name: p.name, age: p.age, gender: p.gender, phone: p.phone,
    bp: p.bp, allergies: p.allergies, notes: cleanNotes(p.notes), careSetting: parseCareSetting(p.notes), createdAt: p.createdAt.toISOString(),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = await getClinicId(session.doctorId);
  const patients = await prisma.patient.findMany({ where: clinicId ? { clinicId } : { doctorId: session.doctorId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ patients: patients.map(serialize) }, { headers: { "Cache-Control": "no-store" } });
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
    const patient = await prisma.patient.create({ data: { doctorId: session.doctorId, clinicId, name, age, gender, phone, bp, allergies, notes: encodeNotes(notes, careSetting) } });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Patient", entityId: patient.id, meta: { name, careSetting } });
    return NextResponse.json({ success: true, patient: serialize(patient) });
  } catch (e) {
    console.error("create patient", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
