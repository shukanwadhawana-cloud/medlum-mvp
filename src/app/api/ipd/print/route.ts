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

  const note = await prisma.clinicalNote.findFirst({
    where: {
      clinicId: membership.clinicId,
      patientId,
      noteType: { in: ["Discharge Note", "Discharge Summary"] },
      status: "FINAL",
      ...(noteId ? { id: noteId } : {}),
    },
    include: { author: { select: { name: true } } },
    orderBy: { finalizedAt: "desc" },
  });
  if (!note) return NextResponse.json({ error: "Discharge summary is not yet finalized." }, { status: 409 });

  const content = note.content;
  const noteType = note.noteType;
  const authoredAt = (note.finalizedAt || note.updatedAt || note.createdAt).toISOString();
  const authorName = note.author?.name || "";
  const authorStaffCode = "";
  const authorDesignation = "";
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
