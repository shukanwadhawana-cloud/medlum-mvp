import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { requireClinicalModule } from "@/lib/clinic-products";
import { cleanPatientNotes, encodePatientNotes, parseCareSetting, parsePatientProfile } from "@/lib/patient-metadata";

async function getContext() {
  const session = await getSession();
  if (!session) return null;
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return null;
  return { session, clinicId: membership.clinicId };
}

const statuses = ["Open", "In Treatment", "Observation", "Admitted", "Discharged", "Transferred"];
const triage = ["Resuscitation", "Emergency", "Urgent", "Less Urgent", "Non-Urgent"];
const CLINICAL_MARKER = "__MEDLUM_EMERGENCY_CLINICAL__";

/** Explicit clinical contract for emergency registration (IPD pilot UI / yellow PCS). */
function buildClinical(body: any) {
  const src = body?.clinical && typeof body.clinical === "object" ? body.clinical : body || {};
  return {
    mlcNumber: String(src.mlcNumber || body.mlcNumber || ""),
    hpi: String(src.hpi || body.hpi || ""),
    pastHistory: String(src.pastHistory || body.pastHistory || ""),
    surgicalHistory: String(src.surgicalHistory || body.surgicalHistory || ""),
    systemicExam: String(src.systemicExam || body.systemicExam || ""),
    workingDiagnosis: String(src.workingDiagnosis || body.workingDiagnosis || ""),
    diagnosis: String(src.diagnosis || body.diagnosis || ""),
  };
}

function encodeNotes(freeText: string, clinical: ReturnType<typeof buildClinical>) {
  return JSON.stringify({ marker: CLINICAL_MARKER, freeText: freeText || "", clinical });
}

function clinicalNotes(raw: string) {
  try {
    const x = JSON.parse(raw || "{}");
    if (x?.marker === CLINICAL_MARKER) return x;
    return { marker: CLINICAL_MARKER, freeText: raw || "" };
  } catch {
    return { marker: CLINICAL_MARKER, freeText: raw || "" };
  }
}

async function listCases(clinicId: string) {
  return prisma.$queryRaw<any[]>(
    Prisma.sql`SELECT e.*,p."name" AS "patientName",p."phone" AS "patientPhone",d."name" AS "doctorName" FROM "EmergencyCase" e LEFT JOIN "Patient" p ON p."id"=e."patientId" LEFT JOIN "Doctor" d ON d."id"=e."doctorId" WHERE e."clinicId"=${clinicId} ORDER BY e."arrivalTime" DESC LIMIT 200`
  );
}

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await listCases(ctx.clinicId);
  const cases = rows.map((c) => {
    const clinical = clinicalNotes(c.notes);
    return {
      ...c,
      clinical,
      patient: c.patientId ? { id: c.patientId, name: c.patientName, phone: c.patientPhone } : null,
      doctor: { id: c.doctorId, name: c.doctorName },
    };
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
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId: ctx.clinicId },
      });
      if (!patient) {
        return NextResponse.json(
          { success: false, error: "Patient not found in this clinic." },
          { status: 404 }
        );
      }
    }
    const arrivalMode = ["Ambulance", "Walk-in", "Referral"].includes(String(body.arrivalMode))
      ? String(body.arrivalMode)
      : "Walk-in";
    const level = triage.includes(String(body.triageLevel)) ? String(body.triageLevel) : "Urgent";
    const id = crypto.randomUUID();
    const arrivalTime = body.arrivalTime ? new Date(body.arrivalTime) : new Date();
    const vitals =
      typeof body.vitals === "string" ? body.vitals : JSON.stringify(body.vitals || {});
    const clinical = buildClinical(body);
    const notes = encodeNotes(String(body.notes || ""), clinical);
    await prisma.$executeRaw(
      Prisma.sql`INSERT INTO "EmergencyCase" ("id","clinicId","patientId","doctorId","arrivalMode","ambulanceProvider","ambulanceNumber","arrivalTime","triageLevel","chiefComplaint","vitals","allergies","status","disposition","notes","createdAt","updatedAt") VALUES (${id},${ctx.clinicId},${patientId},${ctx.session.doctorId},${arrivalMode},${String(body.ambulanceProvider || "")},${String(body.ambulanceNumber || "")},${arrivalTime},${level},${String(body.chiefComplaint || "")},${vitals},${String(body.allergies || "")},'Open',${String(body.disposition || "")},${notes},NOW(),NOW())`
    );
    await prisma.auditLog.create({
      data: {
        doctorId: ctx.session.doctorId,
        action: "EMERGENCY_CASE_CREATED",
        entity: "EmergencyCase",
        entityId: id,
        meta: JSON.stringify({
          clinicId: ctx.clinicId,
          patientId,
          triageLevel: level,
          mlcNumber: clinical.mlcNumber,
          workingDiagnosis: clinical.workingDiagnosis,
        }),
      },
    });
    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error("emergency post", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    if (String(body.action || "") === "admit-to-ipd") {
      const access = await requireClinicalModule(ctx.session.doctorId, "IPD");
      if (!access.allowed || access.clinicId !== ctx.clinicId) {
        return NextResponse.json({ success: false, error: "IPD access is not included in this clinic's subscription." }, { status: 403 });
      }
      const membership = await requireActiveClinicMembership(ctx.session.doctorId);
      const actorRole = membership?.role || "Consultant";
      const admittingRoles = ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO"];
      if (!membership || !admittingRoles.includes(actorRole)) {
        return NextResponse.json({ success: false, error: "You are not authorized to admit patients to IPD." }, { status: 403 });
      }

      const requestedRoom = String(body.roomNumber || "").trim();
      try {
        const result = await prisma.$transaction(async (tx) => {
          const emergency = await tx.emergencyCase.findFirst({
            where: { id, clinicId: ctx.clinicId },
            select: { id: true, clinicId: true, patientId: true, status: true },
          });
          if (!emergency) return { status: 404, body: { success: false, error: "Emergency case not found." } };
          if (emergency.status === "Admitted") {
            return { status: 409, body: { success: false, error: "Emergency case is already admitted to IPD." } };
          }
          if (!emergency.patientId) {
            return { status: 409, body: { success: false, error: "This emergency case has no linked patient and cannot be admitted to IPD." } };
          }
          if (!["Open", "In Treatment", "Observation"].includes(emergency.status)) {
            return { status: 409, body: { success: false, error: "This emergency case is not eligible for IPD admission." } };
          }

          const patient = await tx.patient.findFirst({
            where: { id: emergency.patientId, clinicId: ctx.clinicId, deletedAt: null },
          });
          if (!patient) {
            return { status: 404, body: { success: false, error: "Linked patient was not found in this clinic." } };
          }
          const careSetting = parseCareSetting(patient.notes);
          if (patient.status !== "ACTIVE" || careSetting === "IPD") {
            return { status: 409, body: { success: false, error: careSetting === "IPD" ? "Linked patient is already active IPD." : "Linked patient is not eligible for IPD admission." } };
          }

          if (requestedRoom) {
            const members = await tx.clinicMember.findMany({
              where: { clinicId: ctx.clinicId, isActive: true },
              select: { doctorId: true },
            });
            const roomLogs = await tx.auditLog.findMany({
              where: { doctorId: { in: members.map((m) => m.doctorId) }, entity: "HospitalRoom" },
              orderBy: { createdAt: "desc" },
              take: 3000,
            });
            const roomExists = roomLogs.some((log) => {
              const meta = typeof log.meta === "string" ? JSON.parse(log.meta || "{}") : (log.meta || {});
              return String(meta.clinicId || "") === String(ctx.clinicId) && String(meta.roomNumber || "").trim() === requestedRoom;
            });
            if (!roomExists) {
              return { status: 404, body: { success: false, error: "Destination room is not in the hospital directory." } };
            }

            const activePatients = await tx.patient.findMany({
              where: { clinicId: ctx.clinicId, status: "ACTIVE", deletedAt: null },
              select: { id: true, notes: true },
            });
            const occupied = activePatients.some((p) =>
              p.id !== patient.id &&
              parseCareSetting(p.notes) === "IPD" &&
              String(parsePatientProfile(p.notes).roomNumber || "").trim() === requestedRoom
            );
            if (occupied) {
              return { status: 409, body: { success: false, error: "Destination room is already occupied by another active IPD patient." } };
            }
          }

          const profile = parsePatientProfile(patient.notes);
          const nextProfile = { ...profile, careSetting: "IPD", ...(requestedRoom ? { roomNumber: requestedRoom } : {}) };
          await tx.patient.update({
            where: { id: patient.id },
            data: { notes: encodePatientNotes(cleanPatientNotes(patient.notes), "IPD", nextProfile) },
          });

          await tx.emergencyCase.update({
            where: { id: emergency.id },
            data: { status: "Admitted", disposition: "IPD", updatedAt: new Date() },
          });

          const audit = await tx.auditLog.create({
            data: {
              doctorId: ctx.session.doctorId,
              action: "EMERGENCY_IPD_ADMISSION",
              entity: "EmergencyCase",
              entityId: emergency.id,
              meta: JSON.stringify({
                clinicId: ctx.clinicId,
                patientId: patient.id,
                actorRole,
                fromCareSetting: careSetting,
                toCareSetting: "IPD",
                roomNumber: requestedRoom || null,
              }),
            },
          });

          return {
            status: 200,
            body: {
              success: true,
              emergencyCaseId: emergency.id,
              patientId: patient.id,
              status: "Admitted",
              careSetting: "IPD",
              roomNumber: requestedRoom || null,
              auditId: audit.id,
            },
          };
        }, { isolationLevel: "Serializable" });

        return NextResponse.json(result.body, { status: result.status });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
          return NextResponse.json({ success: false, error: "The admission conflicted with another concurrent admission. Please retry." }, { status: 409 });
        }
        throw e;
      }
    }

    const existing = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT "id","status","notes" FROM "EmergencyCase" WHERE "id"=${id} AND "clinicId"=${ctx.clinicId} LIMIT 1`
    );
    if (!existing.length) {
      return NextResponse.json({ success: false, error: "Case not found" }, { status: 404 });
    }

    const requestedStatus = body.status !== undefined ? String(body.status) : null;
    if (requestedStatus === "Admitted") {
      return NextResponse.json({ success: false, error: "Use the explicit Admit to IPD action for admission." }, { status: 409 });
    }
    if (existing[0].status === "Admitted" && requestedStatus && requestedStatus !== "Admitted") {
      return NextResponse.json({ success: false, error: "An admitted emergency case cannot be moved out of Admitted through this action." }, { status: 409 });
    }

    const status = requestedStatus && statuses.includes(requestedStatus) ? requestedStatus : null;
    const level = triage.includes(String(body.triageLevel)) ? String(body.triageLevel) : null;
    const disposition = body.disposition !== undefined ? String(body.disposition) : null;
    let notes: string | null = null;
    if (body.notes !== undefined || body.clinical !== undefined) {
      const prev = clinicalNotes(existing[0].notes || "");
      const clinical =
        body.clinical !== undefined ? buildClinical(body) : prev.clinical || buildClinical({});
      const freeText = body.notes !== undefined ? String(body.notes || "") : prev.freeText || "";
      notes = encodeNotes(freeText, clinical);
    }
    const closedAt = status === "Discharged" || status === "Transferred" ? new Date() : null;
    if (status) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "EmergencyCase" SET "status"=${status},"updatedAt"=NOW()${closedAt ? Prisma.sql`, "closedAt"=${closedAt}` : Prisma.empty} WHERE "id"=${id} AND "clinicId"=${ctx.clinicId}`
      );
    }
    if (level) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "EmergencyCase" SET "triageLevel"=${level},"updatedAt"=NOW() WHERE "id"=${id} AND "clinicId"=${ctx.clinicId}`
      );
    }
    if (disposition !== null) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "EmergencyCase" SET "disposition"=${disposition},"updatedAt"=NOW() WHERE "id"=${id} AND "clinicId"=${ctx.clinicId}`
      );
    }
    if (notes !== null) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "EmergencyCase" SET "notes"=${notes},"updatedAt"=NOW() WHERE "id"=${id} AND "clinicId"=${ctx.clinicId}`
      );
    }
    await prisma.auditLog.create({
      data: {
        doctorId: ctx.session.doctorId,
        action: "EMERGENCY_CASE_UPDATED",
        entity: "EmergencyCase",
        entityId: id,
        meta: JSON.stringify({ clinicId: ctx.clinicId, status, triageLevel: level }),
      },
    });
    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error("emergency patch", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
