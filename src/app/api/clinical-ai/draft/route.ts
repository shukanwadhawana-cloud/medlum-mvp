import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { generateClinicalDraft, isClinicalAiConfigured } from "@/lib/clinical-ai";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * POST /api/clinical-ai/draft
 * Body: { sourceText, age?, gender? }
 * Returns structured AI DRAFT fields only. Never signs or creates orders.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) {
    return NextResponse.json({ success: false, error: "No active facility membership." }, { status: 403 });
  }

  // Clinical roles only (not pure Billing/Receptionist/Staff)
  const allowed = new Set([
    "Owner",
    "Admin",
    "Manager",
    "Consultant",
    "Doctor",
    "RMO",
    "Nurse",
  ]);
  if (!allowed.has(membership.role)) {
    return NextResponse.json({ success: false, error: "Clinical AI draft is restricted to clinical roles." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const sourceText = String(body.sourceText || body.text || "").trim();
  if (!sourceText || sourceText.length < 3) {
    return NextResponse.json({ success: false, error: "Provide clinical notes or dictation text to draft from." }, { status: 400 });
  }
  if (sourceText.length > 12000) {
    return NextResponse.json({ success: false, error: "Source text is too long (max 12000 characters)." }, { status: 400 });
  }

  // Minimize PHI: never accept name/phone/address from client for the model payload
  const age = Number.isFinite(Number(body.age)) ? Number(body.age) : undefined;
  const gender = typeof body.gender === "string" ? body.gender.trim().slice(0, 20) : undefined;

  const result = await generateClinicalDraft({ sourceText, age, gender });

  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "clinical_ai_draft",
    entity: "ClinicalAiDraft",
    meta: {
      source: result.source,
      provider: result.provider,
      configured: result.configured,
      sourceChars: sourceText.length,
      // Do not persist full clinical payload in audit meta
    },
  });

  return NextResponse.json({
    success: true,
    draft: result.draft,
    source: result.source,
    configured: result.configured,
    provider: result.configured ? result.provider : "none",
    notice:
      "AI DRAFT only. Review and edit before saving. Does not finalize, sign, prescribe, or place orders.",
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  return NextResponse.json({
    success: true,
    configured: isClinicalAiConfigured(),
    notice: "Clinical AI is optional. Manual documentation and dictation work without a provider.",
  });
}
