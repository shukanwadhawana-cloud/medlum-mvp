import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { cleanPatientNotes, encodePatientNotes, parseCareSetting, parsePatientProfile } from "@/lib/patient-metadata";
import { getActiveClinicId, getClinicSetup, requireClinicalModule } from "@/lib/clinic-products";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

function serialize(p: any) {
  const profile = parsePatientProfile(p.notes);
  return { id: p.id, doctorId: p.doctorId, name: p.name, age: p.age, gender: p.gender, phone: p.phone, bp: p.bp, allergies: p.allergies, notes: cleanPatientNotes(p.notes), careSetting: profile.careSetting || parseCareSetting(p.notes), ...profile, createdAt: p.createdAt.toISOString() };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership." }, { status: 403 });
  const clinicId = membership.clinicId;
  const patients = await prisma.patient.findMany({ where: { clinicId }, orderBy: { createdAt: "desc" } });
  const setup = clinicId ? await getClinicSetup(clinicId) : null;
  const visible = setup?.subscriptionModel === "OPD" ? patients.filter(p => parseCareSetting(p.notes) !== "IPD") : setup?.subscriptionModel === "IPD" ? patients.filter(p => parseCareSetting(p.notes) === "IPD") : patients;
  return NextResponse.json({ patients: visible.map(serialize) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json(); const name = String(body.name || "").trim(); const age = parseInt(body.age, 10) || 0; const gender = String(body.gender || "Male"); const phone = String(body.phone || "").trim(); const bp = String(body.bp || ""); const allergies = String(body.allergies || ""); const notes = String(body.notes || ""); const careSetting = body.careSetting === "IPD" ? "IPD" : "OPD";
    if (!name || !phone) return NextResponse.json({ success: false, error: "Name and phone required" }, { status: 400 });
    const module = await requireClinicalModule(session.doctorId, careSetting);
    if (!module.allowed) return NextResponse.json({ success: false, error: `${careSetting} access is not included in this clinic's subscription.` }, { status: 403 });
    const clinicId = module.clinicId;
    const profile = body.profile && typeof body.profile === "object" ? { ...body.profile, careSetting } : { careSetting };
    const patient = await prisma.patient.create({ data: { doctorId: session.doctorId, clinicId, name, age, gender, phone, bp, allergies, notes: encodePatientNotes(notes, careSetting, profile) } });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Patient", entityId: patient.id, meta: { name, careSetting, profile } });
    return NextResponse.json({ success: true, patient: serialize(patient) });
  } catch (e) { console.error("create patient", e); return NextResponse.json({ success: false, error: "Server error" }, { status: 500 }); }
}
