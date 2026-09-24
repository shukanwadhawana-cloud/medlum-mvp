import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { canFinalizeClinicalNote, getClinicalActor, hashClinicalNote } from "@/lib/clinical-signing";

const NOTE_TYPES = new Set([
  "Progress Note",
  "Initial Assessment",
  "Procedure Note",
  "Case Summary",
  "Referral",
  "Consent",
  "Discharge Note",
]);

function publicNote(n: any) {
  return {
    id: n.id,
    clinicId: n.clinicId,
    patientId: n.patientId,
    encounterId: n.encounterId,
    noteType: n.noteType,
    authorRole: n.authorRole,
    title: n.title,
    content: n.content,
    status: n.status,
    version: n.version,
    contentHash: n.contentHash,
    finalHash: n.finalHash,
    submittedAt: n.submittedAt?.toISOString?.() || n.submittedAt || null,
    verifiedAt: n.verifiedAt?.toISOString?.() || n.verifiedAt || null,
    finalizedAt: n.finalizedAt?.toISOString?.() || n.finalizedAt || null,
    createdAt: n.createdAt?.toISOString?.() || n.createdAt,
    updatedAt: n.updatedAt?.toISOString?.() || n.updatedAt,
    author: n.author ? { id: n.author.id, name: n.author.name, email: n.author.email } : null,
    verifier: n.verifier ? { id: n.verifier.id, name: n.verifier.name, email: n.verifier.email } : null,
  };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: membership.clinicId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const notes = await prisma.clinicalNote.findMany({
    where: { clinicId: membership.clinicId, patientId },
    include: {
      author: { select: { id: true, name: true, email: true } },
      verifier: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notes: notes.map(publicNote) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ success: false, error: "No active clinic membership" }, { status: 403 });

  try {
    const body = await req.json();
    const patientId = String(body.patientId || "").trim();
    const content = String(body.content || "").trim();
    const noteType = String(body.noteType || "Progress Note").trim();
    const title = String(body.title || "").trim();
    const encounterId = body.encounterId ? String(body.encounterId) : null;
    const submit = body.submit === true;

    if (!patientId || !content) return NextResponse.json({ success: false, error: "Patient and note content are required" }, { status: 400 });
    if (!NOTE_TYPES.has(noteType)) return NextResponse.json({ success: false, error: "Invalid clinical note type" }, { status: 400 });

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: membership.clinicId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });

    if (encounterId) {
      const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, patientId } });
      if (!encounter) return NextResponse.json({ success: false, error: "Encounter not found for this patient" }, { status: 404 });
    }

    const actor = await getClinicalActor(session.doctorId, membership.clinicId);
    if (!actor) return NextResponse.json({ success: false, error: "Active clinical membership required" }, { status: 403 });

    const version = 1;
    const contentHash = hashClinicalNote(content, version);
    const status = submit ? "PENDING_VERIFICATION" : "DRAFT";
    const now = new Date();

    const note = await prisma.clinicalNote.create({
      data: {
        clinicId: membership.clinicId,
        patientId,
        encounterId,
        authorDoctorId: session.doctorId,
        authorRole: membership.role,
        noteType,
        title,
        content,
        status,
        version,
        contentHash,
        submittedAt: submit ? now : null,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        verifier: { select: { id: true, name: true, email: true } },
      },
    });

    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: submit ? "SUBMIT_FOR_VERIFICATION" : "CREATE_DRAFT",
      entity: "ClinicalNote",
      entityId: note.id,
      meta: { patientId, noteType, status, version, contentHash },
    });

    return NextResponse.json({ success: true, note: publicNote(note) });
  } catch (e) {
    console.error("clinical note create", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ success: false, error: "No active clinic membership" }, { status: 403 });

  try {
    const body = await req.json();
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();
    if (!id) return NextResponse.json({ success: false, error: "Clinical note id is required" }, { status: 400 });

    const actor = await getClinicalActor(session.doctorId, membership.clinicId);
    if (!actor) return NextResponse.json({ success: false, error: "Active clinical membership required" }, { status: 403 });

    if (action === "save-draft") {
      const content = String(body.content || "").trim();
      const title = String(body.title || "").trim();
      const noteType = String(body.noteType || "Progress Note").trim();
      if (!content) return NextResponse.json({ success: false, error: "Note content is required" }, { status: 400 });

      const current = await prisma.clinicalNote.findFirst({ where: { id, clinicId: membership.clinicId } });
      if (!current) return NextResponse.json({ success: false, error: "Clinical note not found" }, { status: 404 });
      if (current.authorDoctorId !== session.doctorId) return NextResponse.json({ success: false, error: "Only the author can edit a draft" }, { status: 403 });
      if (current.status !== "DRAFT") return NextResponse.json({ success: false, error: "Submitted or final notes cannot be edited" }, { status: 409 });

      const nextVersion = current.version + 1;
      const contentHash = hashClinicalNote(content, nextVersion);
      const updated = await prisma.clinicalNote.updateMany({
        where: { id, clinicId: membership.clinicId, status: "DRAFT", version: current.version, authorDoctorId: session.doctorId },
        data: { content, title, noteType, version: nextVersion, contentHash },
      });
      if (updated.count !== 1) return NextResponse.json({ success: false, error: "Draft changed concurrently; reload and try again." }, { status: 409 });
      return NextResponse.json({ success: true, version: nextVersion, contentHash });
    }

    if (action === "submit") {
      const current = await prisma.clinicalNote.findFirst({ where: { id, clinicId: membership.clinicId } });
      if (!current) return NextResponse.json({ success: false, error: "Clinical note not found" }, { status: 404 });
      if (current.authorDoctorId !== session.doctorId) return NextResponse.json({ success: false, error: "Only the author can submit the note" }, { status: 403 });
      if (current.status !== "DRAFT") return NextResponse.json({ success: false, error: "Only a draft can be submitted" }, { status: 409 });

      const submittedAt = new Date();
      const updated = await prisma.clinicalNote.updateMany({
        where: { id, clinicId: membership.clinicId, status: "DRAFT", version: current.version, authorDoctorId: session.doctorId },
        data: { status: "PENDING_VERIFICATION", submittedAt },
      });
      if (updated.count !== 1) return NextResponse.json({ success: false, error: "Note changed concurrently; reload and try again." }, { status: 409 });

      await writeAudit({ doctorId: session.doctorId, clinicId: membership.clinicId, action: "SUBMIT_FOR_VERIFICATION", entity: "ClinicalNote", entityId: id, meta: { version: current.version } });
      return NextResponse.json({ success: true, status: "PENDING_VERIFICATION" });
    }

    if (action === "finalize") {
      if (!canFinalizeClinicalNote(actor.normalizedRole)) {
        return NextResponse.json({ success: false, error: "Your clinic role cannot final-sign clinical notes" }, { status: 403 });
      }

      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.clinicalNote.findFirst({
          where: { id, clinicId: membership.clinicId },
          select: { id: true, patientId: true, authorDoctorId: true, content: true, version: true, status: true, contentHash: true, noteType: true },
        });
        if (!current) return { status: 404, body: { success: false, error: "Clinical note not found" } };
        if (current.status !== "PENDING_VERIFICATION") return { status: 409, body: { success: false, error: "Only notes awaiting verification can be final-signed" } };
        if (current.authorDoctorId === session.doctorId) return { status: 409, body: { success: false, error: "The author cannot be the second verifier. A different clinician must final-sign." } };

        const hash = hashClinicalNote(current.content, current.version);
        if (current.contentHash !== hash) return { status: 409, body: { success: false, error: "Clinical note integrity check failed; the note must not be signed." } };

        const finalHash = hashClinicalNote(
          `${current.content}\nAUTHOR:${current.authorDoctorId}\nVERIFIER:${session.doctorId}\nNOTE:${current.id}`,
          current.version,
        );
        const verifiedAt = new Date();
        const updated = await tx.clinicalNote.updateMany({
          where: { id, clinicId: membership.clinicId, status: "PENDING_VERIFICATION", verifierDoctorId: null, version: current.version },
          data: { status: "FINAL", verifierDoctorId: session.doctorId, verifiedAt, finalizedAt: verifiedAt, finalHash },
        });
        if (updated.count !== 1) return { status: 409, body: { success: false, error: "This note was finalized by another verifier or changed concurrently." } };

        await tx.auditLog.create({
          data: {
            doctorId: session.doctorId,
            action: "FINAL_SIGN",
            entity: "ClinicalNote",
            entityId: id,
            meta: JSON.stringify({
              clinicId: membership.clinicId,
              patientId: current.patientId,
              noteType: current.noteType,
              authorDoctorId: current.authorDoctorId,
              verifierDoctorId: session.doctorId,
              version: current.version,
              contentHash: current.contentHash,
              finalHash,
              at: verifiedAt.toISOString(),
            }),
          },
        });
        return { status: 200, body: { success: true, status: "FINAL", verifierDoctorId: session.doctorId, finalHash } };
      }, { isolationLevel: "Serializable" });

      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json({ success: false, error: "Unknown clinical signing action" }, { status: 400 });
  } catch (e: any) {
    console.error("clinical note patch", e);
    if (e?.code === "P2034") return NextResponse.json({ success: false, error: "Concurrent signing conflict; refresh and try again." }, { status: 409 });
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
