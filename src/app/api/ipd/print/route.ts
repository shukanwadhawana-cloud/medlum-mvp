import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

/**
 * Patient-facing IPD discharge / hospital summary print.
 * Clinical content only — no billing fields.
 * Source: latest ClinicalNote-style audit entry or encounter clinicalNotes for the patient.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId") || "";
  const noteId = url.searchParams.get("noteId") || "";
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: membership.clinicId, deletedAt: null },
    select: {
      id: true,
      name: true,
      age: true,
      gender: true,
      phone: true,
      uhid: true,
      registrationNo: true,
      notes: true,
    },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: {
      name: true,
      address: true,
      phone: true,
      email: true,
      registrationNo: true,
      letterheadHeightMm: true,
      showMedlumFooter: true,
    },
  });

  // Prefer explicit noteId from audit log, else latest discharge-like note
  let content = "";
  let noteType = "Discharge Summary";
  let authoredAt: string | null = null;
  let authorName = "";
  let authorStaffCode = "";
  let authorDesignation = "";

  if (noteId) {
    const log = await prisma.auditLog.findFirst({
      where: { id: noteId, entity: "ClinicalNote", entityId: patientId },
    });
    if (log) {
      try {
        const m = JSON.parse(log.meta || "{}");
        content = String(m.content || "");
        noteType = String(m.noteType || noteType);
        authorName = String(m.actorName || "");
        authorStaffCode = String(m.staffCode || "");
        authorDesignation = String(m.role || m.authorRole || "");
      } catch {
        /* ignore */
      }
      authoredAt = log.createdAt.toISOString();
      if (!authorName && log.doctorId) {
        const d = await prisma.doctor.findUnique({
          where: { id: log.doctorId },
          select: { name: true },
        });
        authorName = d?.name || "";
      }
    }
  }

  if (!content) {
    const logs = await prisma.auditLog.findMany({
      where: { entity: "ClinicalNote", entityId: patientId },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    for (const log of logs) {
      try {
        const m = JSON.parse(log.meta || "{}");
        const t = String(m.noteType || "");
        if (/discharge/i.test(t) || /summary/i.test(t)) {
          content = String(m.content || "");
          noteType = t || noteType;
          authorName = String(m.actorName || "");
          authorStaffCode = String(m.staffCode || "");
          authorDesignation = String(m.role || m.authorRole || "");
          authoredAt = log.createdAt.toISOString();
          if (!authorName && log.doctorId) {
            const d = await prisma.doctor.findUnique({
              where: { id: log.doctorId },
              select: { name: true },
            });
            authorName = d?.name || "";
          }
          break;
        }
      } catch {
        /* continue */
      }
    }
  }

  if (!content) {
    // Fallback: encounter clinicalNotes tagged as discharge
    const encounter = await prisma.encounter.findFirst({
      where: { patientId },
      orderBy: { createdAt: "desc" },
    });
    if (encounter?.clinicalNotes) {
      content = encounter.clinicalNotes;
      noteType = "Hospital Summary";
      authoredAt = encounter.createdAt.toISOString();
    }
  }

  return NextResponse.json({
    printable: {
      documentType: "DISCHARGE_SUMMARY",
      hospital: clinic,
      summary: {
        patient,
        noteType,
        content: content || "No discharge summary content recorded yet.",
        authoredAt,
        author: {
          name: authorName,
          staffCode: authorStaffCode,
          designation: authorDesignation,
        },
      },
    },
  });
}
