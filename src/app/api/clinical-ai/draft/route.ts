import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, canViewFullClinicalChart } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { generateClinicalDraft, type ClinicalAiDraftFields } from "@/lib/clinical-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/clinical-ai/draft
 * Returns structured AI DRAFT fields only. Never creates Encounter, ClinicalNote,
 * Prescription, LabOrder, or DiagnosticOrder. Never signs or finalizes.
 *
 * Authorization: session + active clinic membership + clinical chart role.
 * Client-supplied clinicId/doctorId are intentionally ignored for scope.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) {
    return NextResponse.json({ success: false, error: "No active clinic membership" }, { status: 403 });
  }

  if (!canViewFullClinicalChart(membership.role)) {
    return NextResponse.json(
      { success: false, error: "Clinical documentation role required" },
      { status: 403 }
    );
  }

  let body: {
    sourceText?: string;
    existing?: Partial<ClinicalAiDraftFields>;
    patientContext?: { age?: number | string; gender?: string };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceText = String(body.sourceText || "").slice(0, 8000);
  const existing = body.existing && typeof body.existing === "object" ? body.existing : undefined;
  const patientContext =
    body.patientContext && typeof body.patientContext === "object"
      ? {
          age: body.patientContext.age,
          gender: body.patientContext.gender ? String(body.patientContext.gender).slice(0, 32) : undefined,
        }
      : undefined;

  if (!sourceText.trim() && !(existing && Object.values(existing).some((v) => String(v || "").trim()))) {
    return NextResponse.json(
      { success: false, error: "Provide sourceText or existing clinical fields to draft from" },
      { status: 400 }
    );
  }

  try {
    const result = await generateClinicalDraft({
      sourceText,
      existing,
      patientContext,
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "clinical_ai_draft",
      entity: "ClinicalAiDraft",
      entityId: null,
      clinicId: membership.clinicId,
      meta: {
        provider: result.provider,
        offline: result.offline,
        model: result.model || null,
        fieldCount: Object.keys(result.draft).length,
      },
    });

    return NextResponse.json({
      success: true,
      draft: result.draft,
      provider: result.provider,
      offline: result.offline,
      status: "AI_DRAFT",
      message: "AI draft only. Review, edit, and save through the existing Encounter / ClinicalNote flow.",
    });
  } catch (e) {
    console.error("clinical-ai draft", e);
    return NextResponse.json({ success: false, error: "Could not generate clinical draft" }, { status: 500 });
  }
}
