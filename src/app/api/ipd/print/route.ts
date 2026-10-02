import { NextResponse } from "next/server";
import { parsePatientProfile } from "@/lib/patient-metadata";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

/**
 * Patient-facing IPD discharge / hospital summary print.
 * Only FINAL discharge notes are printable. Content is clinician-authored.
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
    select: { id: true, name: true, age: true, gender: true, phone: true, uhid: true, registrationNo: true, allergies: true, notes: true },
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
        patient: {
          id: patient.id,
          name: patient.name,
          age: patient.age,
          gender: patient.gender,
          phone: patient.phone,
          allergies: patient.allergies,
          uhid: patient.uhid || patient.registrationNo || null,
          registrationNo: patient.registrationNo || null,
        },
        admission: (() => {
          const profile = parsePatientProfile(patient.notes || "") as Record<string, unknown>;
          return {
            admissionDate: profile.admissionDate ? String(profile.admissionDate) : null,
            doa: profile.admissionDate ? String(profile.admissionDate) : null,
            ward: profile.ward ? String(profile.ward) : profile.wardType ? String(profile.wardType) : null,
            wardType: profile.wardType ? String(profile.wardType) : null,
            ipNo: profile.ipNo ? String(profile.ipNo) : profile.ipNumber ? String(profile.ipNumber) : null,
            address: profile.address ? String(profile.address) : null,
            consultant: profile.consultant ? String(profile.consultant) : null,
          };
        })(),
        noteType: note.noteType,
        content,
        authoredAt: (note.finalizedAt || note.updatedAt || note.createdAt).toISOString(),
        author: { name: note.author?.name || "", staffCode: "", designation: "" },
        noteId: note.id,
      },
    },
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
