import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireClinicalModule } from "@/lib/clinic-products";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { canAccessModule } from "@/lib/permissions";
import { cleanPatientNotes, parseCareSetting, parsePatientProfile } from "@/lib/patient-metadata";

function parseMeta(meta: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = meta ? JSON.parse(meta) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Lightweight nursing census endpoint.
 * The full /api/ipd response intentionally assembles the entire clinical chart,
 * medication, diagnostic and room datasets. The nursing landing page needs only
 * active IPD patients, their profile fields and each patient's latest recorded vitals.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireClinicalModule(session.doctorId, "IPD");
  if (!access.allowed) {
    return NextResponse.json({ error: "IPD access is not included in this clinic's subscription." }, { status: 403 });
  }

  const clinicId = access.clinicId;
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || membership.clinicId !== clinicId || !canAccessModule(membership.role, "ipd")) {
    return NextResponse.json(
      { success: false, error: "IPD module access is not authorized for this role or clinic.", code: "RBAC_DENIED" },
      { status: 403 }
    );
  }

  const doctorIds = clinicId
    ? (await prisma.clinicMember.findMany({
        where: { clinicId, isActive: true },
        select: { doctorId: true },
      })).map((member) => member.doctorId)
    : [session.doctorId];

  const patients = await prisma.patient.findMany({
    where: {
      ...(clinicId ? { clinicId } : { doctorId: session.doctorId }),
      status: "ACTIVE",
      deletedAt: null,
      notes: { contains: "__MEDLUM_CARE_SETTING__:IPD" },
    },
    select: {
      id: true,
      name: true,
      age: true,
      gender: true,
      phone: true,
      allergies: true,
      status: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const patientIds = patients.map((patient) => patient.id);
  const logs = patientIds.length
    ? await prisma.auditLog.findMany({
        where: {
          doctorId: { in: doctorIds },
          entity: "NursingVital",
          entityId: { in: patientIds },
        },
        select: { entityId: true, meta: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: Math.min(patientIds.length * 5, 1500),
      })
    : [];

  const latestVitals = new Map<string, Record<string, unknown>>();
  for (const log of logs) {
    if (!log.entityId || latestVitals.has(log.entityId)) continue;
    const meta = parseMeta(log.meta);
    latestVitals.set(log.entityId, {
      ...meta,
      bp: meta.bp ?? meta.BP ?? "",
      pulse: meta.pulse ?? meta.Pulse ?? "",
      spo2: meta.spo2 ?? meta.SpO2 ?? meta.SPO2 ?? "",
      rr: meta.rr ?? meta.RR ?? "",
    });
  }

  const result = patients
    .filter((patient) => parseCareSetting(patient.notes) === "IPD")
    .map((patient) => {
      const profile = parsePatientProfile(patient.notes);
      return {
        id: patient.id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        allergies: patient.allergies,
        status: patient.status,
        notes: cleanPatientNotes(patient.notes),
        wardType: profile.wardType || profile.unitType || "",
        roomNumber: profile.roomNumber || "",
        consultantName: profile.consultantName || "",
        workingDiagnosis: profile.workingDiagnosis || profile.diagnosis || "",
        vitals: latestVitals.get(patient.id) || null,
      };
    });

  return NextResponse.json({ patients: result }, { headers: { "Cache-Control": "no-store" } });
}
