import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, findAuthorizedPatient, normalizeClinicRole } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { consumeRateLimit, authBucketKey, rateLimitResponse } from "@/lib/rate-limit";
import { generateClinicalDraft, isClinicalAiConfigured } from "@/lib/clinical-ai";

const ALLOWED_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Dietitian", "Dietician", "Nutritionist"]);
const clip = (value: unknown, max = 1200) => String(value ?? "").trim().slice(0, max);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ success: false, error: "No active clinic membership" }, { status: 403 });
  const role = normalizeClinicRole(membership.role);
  if (!ALLOWED_ROLES.has(role)) return NextResponse.json({ success: false, error: "Dietitian workflow access is not authorized for this role." }, { status: 403 });
  if (!isClinicalAiConfigured()) return NextResponse.json({ success: false, error: "Nutrition AI is not configured. Continue with the manual diet-chart form; no chart was generated." }, { status: 503 });
  const rate = await consumeRateLimit(authBucketKey("diet-chart-ai", req, session.doctorId), 10, 15 * 60 * 1000);
  if (!rate.allowed) { const limited = rateLimitResponse(rate.retryAfterSec); return NextResponse.json(limited.body, { status: 429, headers: limited.headers }); }
  if (Number(req.headers.get("content-length") || 0) > 32000) return NextResponse.json({ success: false, error: "Request body is too large." }, { status: 413 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  if (body.clinicId != null || body.role != null || body.membershipId != null) return NextResponse.json({ success: false, error: "Clinic and role are derived from your session." }, { status: 400 });
  const patientId = clip(body.patientId, 64);
  if (!patientId) return NextResponse.json({ success: false, error: "Select a registered patient before generating a diet-chart draft." }, { status: 400 });
  const patient = await findAuthorizedPatient(membership, patientId);
  if (!patient) return NextResponse.json({ success: false, error: "Patient not found in this clinic." }, { status: 404 });

  const diagnosis = clip(body.diagnosis);
  const comorbidities = clip(body.comorbidities);
  const weightKg = clip(body.weightKg, 20);
  const heightCm = clip(body.heightCm, 20);
  const dietPreference = clip(body.dietPreference, 120);
  const ckdStage = clip(body.ckdStage, 40);
  const dialysisStatus = clip(body.dialysisStatus, 80);
  const labs = clip(body.labs, 2400);
  const fluidRestriction = clip(body.fluidRestriction, 300);
  const oralEnteralIntake = clip(body.oralEnteralIntake, 300);
  const goals = clip(body.goals, 500);
  const allergies = clip(patient.allergies || body.allergies, 500);
  const lowerConditions = (diagnosis + " " + comorbidities).toLowerCase();
  const isCkd = /\bckd\b|chronic kidney|renal failure|dialysis/.test(lowerConditions);
  const isPle = /protein.?losing enteropathy|\bple\b/.test(lowerConditions);
  const missing: string[] = [];
  if (!diagnosis && !comorbidities) missing.push("diagnosis/comorbidities");
  if (!weightKg) missing.push("current weight (kg)");
  if (!heightCm) missing.push("height (cm)");
  if (!dietPreference) missing.push("explicit dietary preference");
  if (!allergies) missing.push("allergy status (known allergies or explicitly unknown/NKDA)");
  if (isCkd && !ckdStage) missing.push("CKD stage");
  if (isCkd && !dialysisStatus) missing.push("dialysis status");
  if ((isCkd || isPle) && !labs) missing.push("recent relevant labs (including potassium/phosphate where applicable)");
  if (missing.length) return NextResponse.json({ success: false, error: "Complete these critical inputs before generating a high-risk nutrition draft.", missingInputs: missing }, { status: 422 });

  const context = [
    "Create a DIETITIAN NUTRITION CHART draft, not a general clinical note.",
    "Use a structured meal-by-meal chart with meal/time, food and portions, substitutions, estimated energy/protein/carbohydrate and sodium/potassium/phosphorus/fluid only where clinically relevant, rationale, cautions and source/version/date.",
    "Do not invent laboratory values, diagnoses, body measurements, targets, references, or source dates. If a target or source cannot be supported by the supplied information, state that it requires dietitian verification instead of guessing.",
    "Respect the patient's stated dietary preference and allergies. Never assume preferences from demographics. Do not apply blanket protein, potassium, phosphorus or fluid restrictions to all CKD patients; individualize only when stage, dialysis status, nutritional status and labs support it.",
    "For hypothyroidism and protein-losing enteropathy, do not make condition-specific therapeutic claims without verified condition-specific guidance; flag specialist dietitian review. Complex multimorbidity is high-risk.",
    "The output is an editable DRAFT only. Do not issue an order or imply approval. Include the guidance basis only where supported: ADA Standards of Care in Diabetes—2026 for diabetes nutrition context; KDIGO 2024 CKD guideline for CKD context. State that local/current source verification is required before approval.",
    "Patient context (use only these supplied facts):",
    JSON.stringify({ age: patient.age, gender: patient.gender, allergies, diagnosis, comorbidities, weightKg, heightCm, dietPreference, ckdStage, dialysisStatus, labs, fluidRestriction, oralEnteralIntake, goals, culturalPreferences: clip(body.culturalPreferences, 200), medications: clip(body.medications, 800), nutritionScreening: clip(body.nutritionScreening, 500) }),
  ].join("\n");

  await writeAudit({ doctorId: session.doctorId, clinicId: membership.clinicId, action: "DIET_CHART_AI_DRAFT_REQUESTED", entity: "ClinicalWorkflow", entityId: patient.id, meta: { patientId: patient.id, highRisk: isCkd || isPle } });
  try {
    const draft = await generateClinicalDraft({
      noteType: "Dietitian Nutrition Chart",
      patientName: patient.name,
      age: patient.age,
      gender: patient.gender,
      allergies,
      diagnosis,
      clinicalNotes: labs,
      assessment: nutritionScreening,
      plan: "",
      clinicianNotes: context,
    });
    if (draft.source === "heuristic") return NextResponse.json({ success: false, error: "The configured AI provider did not return a nutrition draft. Continue manually; no AI chart was generated." }, { status: 502 });
    await writeAudit({ doctorId: session.doctorId, clinicId: membership.clinicId, action: "DIET_CHART_AI_DRAFT_GENERATED", entity: "ClinicalWorkflow", entityId: patient.id, meta: { patientId: patient.id, source: draft.source, highRisk: isCkd || isPle } });
    return NextResponse.json({
      success: true,
      draft: { history: draft.history, assessment: draft.assessment, mealChart: draft.plan, monitoring: draft.followUp, patientInstructions: draft.patientInstructions, guidanceSources: "ADA Standards of Care in Diabetes — 2026 edition (diabetes context; verify current publication details before approval). KDIGO CKD Guideline — 2024 edition (CKD context; individualize by stage, dialysis status, nutrition status and labs). Hypothyroidism-specific and protein-losing-enteropathy guidance: verify a current condition-specific source before making therapeutic claims.", source: draft.source, disclaimer: "AI-generated DRAFT only. Dietitian/clinician must verify every portion, nutrient estimate, clinical restriction and cited source before approval.", status: "DRAFT", approved: false },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("diet chart draft failed", error instanceof Error ? error.message : "error");
    await writeAudit({ doctorId: session.doctorId, clinicId: membership.clinicId, action: "DIET_CHART_AI_DRAFT_FAILED", entity: "ClinicalWorkflow", entityId: patient.id, meta: { patientId: patient.id } });
    return NextResponse.json({ success: false, error: "Nutrition AI failed. No chart was generated; continue with the manual form." }, { status: 502 });
  }
}
