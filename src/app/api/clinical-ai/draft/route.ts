import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { requireActiveClinicMembership, normalizeClinicRole, findAuthorizedPatient } from "@/lib/clinic-auth";
import { canAccessModule } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { consumeRateLimit, authBucketKey, rateLimitResponse } from "@/lib/rate-limit";
import {
  generateClinicalDraft,
  isClinicalAiConfigured,
  type ClinicalAiContext,
} from "@/lib/clinical-ai";

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function clipClient(value: unknown, max = 2000): string {
  if (value == null) return "";
  return String(value).trim().slice(0, max);
}

/**
 * POST /api/clinical-ai/draft
 * Returns an editable structured clinical documentation draft.
 * Does NOT create, finalize, or sign ClinicalNote rows.
 * Existing patients: facility-scoped lookup (incl. legacy null clinicId).
 * New patients: draft from form/OCR context only — no patient row required.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return fail("Unauthorized", 401);

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return fail("No active clinic membership", 403);

  const role = normalizeClinicRole(membership.role);
  // Only the clinical_assist module — not broader OPD/reception access.
  if (!canAccessModule(role, "clinical_assist")) {
    return fail("Your role cannot use clinical documentation assist.", 403);
  }

  const rl = await consumeRateLimit(
    authBucketKey("clinical-ai-draft", req, session.doctorId),
    30,
    15 * 60 * 1000,
  );
  if (!rl.allowed) {
    const limited = rateLimitResponse(rl.retryAfterSec);
    return NextResponse.json(limited.body, { status: 429, headers: limited.headers });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 64_000) {
    return fail("Request body is too large.", 413);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body.");
  }
  // Reject client-supplied facility/role claims; membership is server-derived only.
  if (body.clinicId != null || body.role != null || body.membershipId != null) {
    return fail("Facility and role are derived from your session and cannot be supplied by the client.", 400);
  }

  const patientIdRaw = clipClient(body.patientId, 64);
  // "new" / empty = draft-only for a patient not yet registered in this facility.
  const patientId = !patientIdRaw || patientIdRaw === "new" ? "" : patientIdRaw;

  const clinicianNotes = clipClient(body.clinicianNotes);
  const noteType = clipClient(body.noteType, 80) || "Progress Note";
  const bodyChief = clipClient(body.chiefComplaint);
  const bodyNotes = clipClient(body.clinicalNotes);
  const bodyDiagnosis = clipClient(body.diagnosis);
  const bodyAssessment = clipClient(body.assessment);
  const bodyPlan = clipClient(body.plan);
  const bodyName = clipClient(body.patientName, 120);
  const bodyAgeRaw = clipClient(body.age, 10);
  const bodyAge = bodyAgeRaw && /^\d{1,3}$/.test(bodyAgeRaw) ? Number(bodyAgeRaw) : null;
  const bodyGender = clipClient(body.gender, 20);
  const bodyAllergies = clipClient(body.allergies, 500);

  let patient: {
    id: string;
    name: string;
    age: number | null;
    gender: string | null;
    allergies: string;
    bp: string;
    notes: string;
  } | null = null;

  if (patientId) {
    // Facility + legacy doctor-owned rows (null clinicId).
    const authorized = await findAuthorizedPatient(membership, patientId);
    if (!authorized) {
      return fail("Patient not found in the selected facility. Select an existing patient from this clinic, or use New patient with typed notes.", 404);
    }
    patient = {
      id: authorized.id,
      name: authorized.name,
      age: authorized.age,
      gender: authorized.gender,
      allergies: authorized.allergies || "",
      bp: authorized.bp || "",
      notes: authorized.notes || "",
    };
  } else {
    // New-patient / pre-registration draft: require some clinical context from the form.
    const hasContext = Boolean(bodyNotes || bodyChief || bodyDiagnosis || bodyAssessment || bodyPlan || clinicianNotes);
    if (!hasContext) {
      return fail("Add chief complaint, clinical notes, or OCR text before generating a draft for a new patient.", 400);
    }
  }

  const encounterId = clipClient(body.encounterId, 64);
  let encounter: {
    id: string;
    chiefComplaint: string;
    clinicalNotes: string;
    diagnosis: string;
    assessment: string;
    plan: string;
    bp: string;
    pulse: string;
    temperature: string;
    spo2: string;
    rr: string;
  } | null = null;

  if (encounterId) {
    if (!patient) return fail("Encounter lookup requires an existing patient.", 400);
    encounter = await prisma.encounter.findFirst({
      where: { id: encounterId, patientId: patient.id },
      select: {
        id: true,
        chiefComplaint: true,
        clinicalNotes: true,
        diagnosis: true,
        assessment: true,
        plan: true,
        bp: true,
        pulse: true,
        temperature: true,
        spo2: true,
        rr: true,
      },
    });
    if (!encounter) return fail("Encounter not found for this patient.", 404);
  }

  const ctx: ClinicalAiContext = {
    noteType,
    patientName: patient?.name || bodyName || undefined,
    age: patient?.age ?? bodyAge,
    gender: patient?.gender || bodyGender || undefined,
    chiefComplaint: encounter?.chiefComplaint || bodyChief || "",
    clinicalNotes: encounter?.clinicalNotes || bodyNotes || patient?.notes || "",
    diagnosis: encounter?.diagnosis || bodyDiagnosis || "",
    assessment: encounter?.assessment || bodyAssessment || "",
    plan: encounter?.plan || bodyPlan || "",
    allergies: patient?.allergies || bodyAllergies || "",
    clinicianNotes,
    vitals: {
      bp: encounter?.bp || patient?.bp || clipClient(body.bp, 40),
      pulse: encounter?.pulse || clipClient(body.pulse, 40),
      temperature: encounter?.temperature || clipClient(body.temperature, 40),
      spo2: encounter?.spo2 || clipClient(body.spo2, 40),
      rr: encounter?.rr || clipClient(body.rr, 40),
    },
  };

  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "AI_DRAFT_REQUESTED",
    entity: "ClinicalAiDraft",
    entityId: patient?.id || "new-patient-draft",
    meta: {
      patientId: patient?.id || null,
      encounterId: encounter?.id || null,
      noteType,
      configured: isClinicalAiConfigured(),
    },
  });

  try {
    const draft = await generateClinicalDraft(ctx);

    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "AI_DRAFT_GENERATED",
      entity: "ClinicalAiDraft",
      entityId: patient?.id || "new-patient-draft",
      meta: {
        patientId: patient?.id || null,
        encounterId: encounter?.id || null,
        noteType,
        source: draft.source,
        // Do not store full draft content in audit meta (privacy / minimization).
        sectionKeys: ["history", "examination", "assessment", "plan", "followUp", "patientInstructions"],
      },
    });

    return NextResponse.json({
      success: true,
      draft: {
        history: draft.history,
        examination: draft.examination,
        assessment: draft.assessment,
        plan: draft.plan,
        followUp: draft.followUp,
        patientInstructions: draft.patientInstructions,
        combined: draft.combined,
        source: draft.source,
        disclaimer: draft.disclaimer,
        status: "AI_GENERATED_DRAFT",
      },
      // Explicit: this endpoint never finalizes clinical records.
      finalized: false,
      noteId: null,
    });
  } catch (e) {
    console.error("clinical-ai draft error", e instanceof Error ? e.message : "error");
    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "AI_DRAFT_FAILED",
      entity: "ClinicalAiDraft",
      entityId: patient?.id || "new-patient-draft",
      meta: { patientId: patient?.id || null, encounterId: encounter?.id || null },
    });
    return fail("Clinical draft could not be generated. Try again or continue with a manual note.", 502);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Unauthorized", 401);
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return fail("No active clinic membership", 403);
  const role = normalizeClinicRole(membership.role);
  if (!canAccessModule(role, "clinical_assist")) {
    return fail("Your role cannot use clinical documentation assist.", 403);
  }
  return NextResponse.json({
    success: true,
    configured: isClinicalAiConfigured(),
    mode: isClinicalAiConfigured() ? "provider" : "heuristic",
    note: "AI drafts require clinician review. Finalization uses existing ClinicalNote signing.",
  });
}
