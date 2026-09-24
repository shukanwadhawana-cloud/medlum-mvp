import { NextResponse } from "next/server";
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
    // Keep the database id private/technical while exposing a stable, human-facing MedLum ID.
    medlumId: `MLD-${String(p.id || "").slice(-8).toUpperCase()}`,
    admissionDate: profile.admissionDate || (profile.careSetting === "IPD" ? p.createdAt.toISOString() : null),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
    ...profile,
    latestVitals,
    createdAt: p.createdAt.toISOString(),
  };
}

function generateUhid(clinicId: string): string {
  // Human-facing UHID: stable date component + six-digit sequence-like random suffix.
  // The database primary key remains the canonical technical identifier.
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
  const includeDischarged = url.searchParams.get("includeDischarged") === "1" || url.searchParams.get("includeDischarged") === "true";
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";

  const where: any = {
    clinicId,
    ...(includeDeleted ? {} : { deletedAt: null }),
  };

  // Active dashboard excludes DISCHARGED and ARCHIVED unless explicitly searching / including
  if (!q && !includeDischarged) {
    where.NOT = { status: { in: ["DISCHARGED", "ARCHIVED"] } };
  } else if (!includeDischarged) {
    // When searching, still exclude ARCHIVED by default; allow DISCHARGED so post-discharge search works
    where.NOT = { status: "ARCHIVED" };
  }

  let patients = await prisma.patient.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: q ? 100 : 500,
  });

  if (q) {
    patients = patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phone || "").toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.uhid || "").toLowerCase().includes(q) ||
        (p.registrationNo || "").toLowerCase().includes(q)
    );
  }

  const setup = clinicId ? await getClinicSetup(clinicId) : null;
  const visible =
    membership.role === "Owner"
      ? patients
      : setup?.subscriptionModel === "OPD"
        ? patients.filter((p) => parseCareSetting(p.notes) !== "IPD")
        : setup?.subscriptionModel === "IPD"
          ? patients.filter((p) => parseCareSetting(p.notes) === "IPD")
          : patients;

  const visibleIds = visible.map((p) => p.id);
  const [encounters, vitalLogs] = await Promise.all([
    visibleIds.length ? prisma.encounter.findMany({ where: { patientId: { in: visibleIds } }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    visibleIds.length
      ? prisma.auditLog.findMany({
          where: { entity: "NursingVital", entityId: { in: visibleIds } },
          orderBy: { createdAt: "desc" },
          take: Math.min(visibleIds.length * 5, 2500),
        })
      : Promise.resolve([]),
  ]);
  const latestVitalsByPatient = new Map<string, any>();
  const considerVitals = (patientId: string, vitals: any) => {
    if (!patientId) return;
    const existing = latestVitalsByPatient.get(patientId);
    const nextTime = new Date(vitals.recordedAt || 0).getTime();
    const existingTime = new Date(existing?.recordedAt || 0).getTime();
    if (!existing || nextTime >= existingTime) latestVitalsByPatient.set(patientId, vitals);
  };
  // Current snapshot = newest valid vitals across OPD encounters and IPD nursing rounds.
  for (const e of encounters) {
    if (e.bp || e.pulse || e.rr || e.spo2 || e.temperature || e.weight || e.height) {
      considerVitals(e.patientId, {
        bp: e.bp, pulse: e.pulse, rr: e.rr, spo2: e.spo2, temperature: e.temperature,
        weight: e.weight, height: e.height, recordedAt: e.createdAt.toISOString(), source: "OPD",
      });
    }
  }
  for (const log of vitalLogs) {
    let meta: any = {};
    try { meta = JSON.parse(log.meta || "{}"); } catch {}
    considerVitals(log.entityId || "", {
      bp: String(meta.bp || ""), pulse: String(meta.pulse || ""), rr: String(meta.rr || ""),
      spo2: String(meta.spo2 || ""), temperature: String(meta.temperature || ""),
      recordedAt: log.createdAt.toISOString(), source: "IPD",
    });
  }

  return NextResponse.json(
    { patients: visible.map((p) => serialize(p, latestVitalsByPatient.get(p.id) || null)) },
    { headers: { "Cache-Control": "no-store" } }
  );
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
    const module = await requireClinicalModule(session.doctorId, careSetting);
    if (!module.allowed)
      return NextResponse.json(
        { success: false, error: `${careSetting} access is not included in this clinic's subscription.` },
        { status: 403 }
      );
    const clinicId = module.clinicId;
    const profile = body.profile && typeof body.profile === "object" ? { ...body.profile, careSetting } : { careSetting };
    const uhid = String(body.uhid || "").trim() || generateUhid(clinicId || "clinic");
    const registrationNo = String(body.registrationNo || "").trim() || uhid;
    const patient = await prisma.patient.create({
      data: {
        doctorId: session.doctorId,
        clinicId,
        name,
        age,
        gender,
        phone,
        bp,
        allergies,
        notes: encodePatientNotes(notes, careSetting, profile),
        uhid,
        registrationNo,
        status: "ACTIVE",
      },
    });
    await writeAudit({
      doctorId: session.doctorId,
      action: "create",
      entity: "Patient",
      entityId: patient.id,
      meta: { name, careSetting, profile, uhid, registrationNo },
    });
    return NextResponse.json({ success: true, patient: serialize(patient) });
  } catch (e) {
    console.error("create patient", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
