import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

/**
 * Patient-facing IPD discharge / hospital summary print.
 * Clinical content only — no billing fields.
 * Source: the finalized ClinicalNote for the selected patient.
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
    select: { id: true, name: true, age: true, gender: true, phone: true, uhid: true, registrationNo: true },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: { name: true, address: true, phone: true, email: true, registrationNo: true, letterheadHeightMm: true, showMedlumFooter: true },
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

  const content = String(note.content || "").trim();
  if (!content) return NextResponse.json({ error: "The finalized discharge summary has no clinical content. It must be re-saved before printing." }, { status: 409 });

  return NextResponse.json({
    printable: {
      documentType: "DISCHARGE_SUMMARY",
      hospital: clinic,
      summary: {
        patient: { ...patient, uhid: patient.uhid || patient.registrationNo || null },
        noteType: note.noteType,
        content,
        authoredAt: (note.finalizedAt || note.updatedAt || note.createdAt).toISOString(),
        author: { name: note.author?.name || "", staffCode: "", designation: "" },
        noteId: note.id,
      },
    },
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
