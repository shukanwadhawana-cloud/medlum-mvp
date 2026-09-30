import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { cleanPatientNotes, encodePatientNotes, parseCareSetting, parsePatientProfile } from "@/lib/patient-metadata";
import { getClinicSetup, requireClinicalModule } from "@/lib/clinic-products";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

function formatUhid(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^UHID-/i.test(raw)) return raw.toUpperCase();
  const legacy = raw.match(/^ML-(\d{6})-(\d{4,6})$/i);
  if (legacy) return `UHID-${legacy[1]}-${legacy[2]}`;
  return raw.toUpperCase();
}

function serialize(p: any, latestVitals: any = null) {
  const profile = parsePatientProfile(p.notes);
  return {
    id: p.id,
    doctorId: p.doctorId,
    name: p.name,
    age: p.age,
    gender: p.gender,
    phone: p.phone,
    bp: p.bp,
    allergies: p.allergies,
    notes: cleanPatientNotes(p.notes),
    careSetting: profile.careSetting || parseCareSetting(p.notes),
    status: p.status || "ACTIVE",
    uhid: formatUhid(p.uhid),
    registrationNo: formatUhid(p.registrationNo),
    medlumId: `MLD-${String(p.id || "").slice(-8).toUpperCase()}`,
    admissionDate: profile.admissionDate || (profile.careSetting === "IPD" ? p.createdAt.toISOString() : null),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
    ...profile,
    latestVitals,
    createdAt: p.createdAt.toISOString(),
  };
}

function generateUhid(clinicId: string): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "").slice(2);
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `UHID-${day}-${rand}`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership." }, { status: 403 });
  const clinicId = membership.clinicId;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const view = String(url.searchParams.get("view") || "active").toLowerCase();
  const includeDischarged = url.searchParams.get("includeDischarged") === "1" || url.searchParams.get("includeDischarged") === "true";
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";
  const dateOfBirth = (url.searchParams.get("dateOfBirth") || "").trim();
  const where: any = { clinicId, ...(includeDeleted ? {} : { deletedAt: null }) };
  if (!q && !includeDischarged) where.NOT = { status: { in: ["DISCHARGED", "ARCHIVED"] } };
  else if (!includeDischarged) where.NOT = { status: "ARCHIVED" };

  // Deep search is database-side. Each supplied field is an AND criterion,
  // while each criterion can match its supported Patient fields.
  const searchAnd: any[] = [];
  const name = (url.searchParams.get("name") || "").trim();
  const phone = (url.searchParams.get("phone") || "").trim();
  const identifier = (url.searchParams.get("identifier") || "").trim();
  if (name) searchAnd.push({ OR: [{ name: { contains: name, mode: "insensitive" } }] });
  if (phone) searchAnd.push({ OR: [{ phone: { contains: phone.replace(/\\D/g, ""), mode: "insensitive" } }] });
  if (identifier) searchAnd.push({ OR: [{ id: { contains: identifier, mode: "insensitive" } }, { uhid: { contains: identifier, mode: "insensitive" } }, { registrationNo: { contains: identifier, mode: "insensitive" } }, { abhaNumber: { contains: identifier, mode: "insensitive" } }] });
  if (dateOfBirth) {
    const normalizedDob = dateOfBirth.replace(/\\//g, "-");
    const dobOr: any[] = [{ notes: { contains: dateOfBirth, mode: "insensitive" } }];
    if (normalizedDob !== dateOfBirth) dobOr.push({ notes: { contains: normalizedDob, mode: "insensitive" } });
    searchAnd.push({ OR: dobOr });
  }
  if (q && !searchAnd.length) searchAnd.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q, mode: "insensitive" } }, { id: { contains: q, mode: "insensitive" } }, { uhid: { contains: q, mode: "insensitive" } }, { registrationNo: { contains: q, mode: "insensitive" } }, { abhaNumber: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }] });
  if (searchAnd.length) where.AND = searchAnd;

  // The patient index views must use the source clinical relationships rather than
  // assuming every emergency/appointment patient is already present in the active census.
  // This keeps active census filtering intact while allowing linked emergency and
  // appointment records to be surfaced in their dedicated views.
  if (view === "appointments") {
    const appointmentPatients = await prisma.appointment.findMany({
      where: { clinicId, status: { notIn: ["Cancelled", "No Show"] } },
      select: { patientId: true },
      distinct: ["patientId"],
    });
    where.id = { in: appointmentPatients.map((x) => x.patientId).filter(Boolean) };
  } else if (view === "emergency") {
    const emergencyPatients = await prisma.emergencyCase.findMany({
      where: { clinicId, status: { notIn: ["Discharged", "Transferred"] }, patientId: { not: null } },
      select: { patientId: true },
      distinct: ["patientId"],
    });
    where.id = { in: emergencyPatients.map((x) => x.patientId).filter(Boolean) as string[] };
  }

  const patients = await prisma.patient.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });

  const setup = clinicId ? await getClinicSetup(clinicId) : null;
  // Appointment/Emergency/Search are relationship/history-driven datasets.
  // Do not apply the default OPD/IPD census subscription filter to them.
  const relationshipView = view === "appointments" || view === "emergency" || view === "search";
  const visible = relationshipView || membership.role === "Owner"
    ? patients
    : setup?.subscriptionModel === "OPD"
      ? patients.filter((p) => parseCareSetting(p.notes) !== "IPD")
      : setup?.subscriptionModel === "IPD"
        ? patients.filter((p) => parseCareSetting(p.notes) === "IPD")
        : patients;
  const visibleIds = visible.map((p) => p.id);
  const [encounters, vitalLogs, appointments, emergencyCases] = await Promise.all([
    visibleIds.length ? prisma.encounter.findMany({ where: { patientId: { in: visibleIds } }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    visibleIds.length ? prisma.auditLog.findMany({ where: { entity: "NursingVital", entityId: { in: visibleIds } }, orderBy: { createdAt: "desc" }, take: Math.min(visibleIds.length * 5, 2500) }) : Promise.resolve([]),
    visibleIds.length ? prisma.appointment.findMany({ where: { patientId: { in: visibleIds }, status: { notIn: ["Cancelled", "No Show"] } }, select: { id: true, patientId: true, date: true, time: true, status: true }, orderBy: [{ date: "asc" }, { time: "asc" }] }) : Promise.resolve([]),
    visibleIds.length ? prisma.$queryRaw<any[]>(Prisma.sql`SELECT "patientId","status","arrivalTime" FROM "EmergencyCase" WHERE "clinicId"=${clinicId} AND "patientId" IN (${Prisma.join(visibleIds)}) ORDER BY "arrivalTime" DESC`) : Promise.resolve([]),
  ]);
  const appointmentMeta = new Map<string, { count: number; next: any | null }>();
  for (const a of appointments) {
    const current = appointmentMeta.get(a.patientId) || { count: 0, next: null };
    current.count += 1;
    if (!current.next) current.next = a;
    appointmentMeta.set(a.patientId, current);
  }
  const emergencyMeta = new Map<string, { count: number; latestStatus: string | null }>();
  for (const e of emergencyCases) {
    if (!e.patientId) continue;
    const current = emergencyMeta.get(e.patientId) || { count: 0, latestStatus: null };
    current.count += 1;
    if (!current.latestStatus) current.latestStatus = e.status || null;
    emergencyMeta.set(e.patientId, current);
  }
  const latestVitalsByPatient = new Map<string, any>();
  const considerVitals = (patientId: string, vitals: any) => {
    if (!patientId) return;
    const existing = latestVitalsByPatient.get(patientId);
    const nextTime = new Date(vitals.recordedAt || 0).getTime();
    const existingTime = new Date(existing?.recordedAt || 0).getTime();
    if (!existing || nextTime >= existingTime) latestVitalsByPatient.set(patientId, vitals);
  };
  for (const e of encounters) if (e.bp || e.pulse || e.rr || e.spo2 || e.temperature || e.weight || e.height) considerVitals(e.patientId, { bp: e.bp, pulse: e.pulse, rr: e.rr, spo2: e.spo2, temperature: e.temperature, weight: e.weight, height: e.height, recordedAt: e.createdAt.toISOString(), source: "OPD" });
  for (const log of vitalLogs) { let meta: any = {}; try { meta = JSON.parse(log.meta || "{}"); } catch {} considerVitals(log.entityId || "", { bp: String(meta.bp || ""), pulse: String(meta.pulse || ""), rr: String(meta.rr || ""), spo2: String(meta.spo2 || ""), temperature: String(meta.temperature || ""), recordedAt: log.createdAt.toISOString(), source: "IPD" }); }
  return NextResponse.json({ patients: visible.map((p) => ({ ...serialize(p, latestVitalsByPatient.get(p.id) || null), appointmentsCount: appointmentMeta.get(p.id)?.count || 0, nextAppointment: appointmentMeta.get(p.id)?.next || null, emergencyCaseCount: emergencyMeta.get(p.id)?.count || 0, latestEmergencyStatus: emergencyMeta.get(p.id)?.latestStatus || null })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const membership = await requireActiveClinicMembership(session.doctorId);
    if (!membership) return NextResponse.json({ success: false, error: "Your account is not assigned to an active facility." }, { status: 403 });

    // Patient registration is a clinical/front-desk operation. Consultants and doctors
    // must be able to register patients directly; non-clinical service roles cannot.
    const registrationRoles = ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Receptionist", "Staff"];
    if (!registrationRoles.includes(membership.role)) {
      return NextResponse.json({ success: false, error: `Your ${membership.role} role is not permitted to register patients.` }, { status: 403 });
    }

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

    const module = await requireClinicalModule(session.doctorId, careSetting);
    if (!module.allowed) return NextResponse.json({ success: false, error: `${careSetting} access is not included in this clinic's subscription.` }, { status: 403 });
    const clinicId = module.clinicId;
    const profile = body.profile && typeof body.profile === "object" ? { ...body.profile, careSetting } : { careSetting };
    const uhid = String(body.uhid || "").trim() || generateUhid(clinicId || "clinic");
    const registrationNo = String(body.registrationNo || "").trim() || uhid;
    const patient = await prisma.patient.create({ data: { doctorId: session.doctorId, clinicId, name, age, gender, phone, bp, allergies, notes: encodePatientNotes(notes, careSetting, profile), uhid, registrationNo, status: "ACTIVE" } });
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Patient", entityId: patient.id, meta: { name, careSetting, profile, uhid, registrationNo, registeredByRole: membership.role } });
    return NextResponse.json({ success: true, patient: serialize(patient) });
  } catch (e) {
    console.error("create patient", e);
    return NextResponse.json({ success: false, error: "Patient registration failed. Please verify your active facility and try again." }, { status: 500 });
  }
}
