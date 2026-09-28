import "server-only";

/**
 * Server-only AI-assisted clinical documentation helpers.
 * AI produces editable drafts only. Clinician must review, edit, and finalize
 * through existing ClinicalNote / Encounter flows. Never auto-signs or mutates
 * protected clinical records.
 */

export type ClinicalAiDraftSections = {
  history: string;
  examination: string;
  assessment: string;
  plan: string;
  followUp: string;
  patientInstructions: string;
};

export type ClinicalAiDraftResult = ClinicalAiDraftSections & {
  source: "heuristic" | "openai" | "gemini";
  disclaimer: string;
  combined: string;
};

export type ClinicalAiContext = {
  noteType?: string;
  patientName?: string;
  age?: number | null;
  gender?: string | null;
  chiefComplaint?: string;
  clinicalNotes?: string;
  diagnosis?: string;
  assessment?: string;
  plan?: string;
  vitals?: {
    bp?: string;
    pulse?: string;
    temperature?: string;
    spo2?: string;
    rr?: string;
  };
  allergies?: string;
  clinicianNotes?: string;
};

const DISCLAIMER =
  "AI-generated draft for clinician review only. Verify all clinical content before saving or acting. The clinician remains responsible for the final record.";

const MAX_FIELD = 4000;

function clip(value: unknown, max = MAX_FIELD): string {
  if (value == null) return "";
  return String(value).trim().slice(0, max);
}

function nonEmpty(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join("\n");
}

/** Build a structured draft from authorized clinical context without an external model. */
export function generateHeuristicDraft(ctx: ClinicalAiContext): ClinicalAiDraftResult {
  const complaint = clip(ctx.chiefComplaint) || clip(ctx.clinicianNotes) || "Presenting concerns as documented by the clinician.";
  const notes = clip(ctx.clinicalNotes);
  const diagnosis = clip(ctx.diagnosis);
  const assessmentIn = clip(ctx.assessment);
  const planIn = clip(ctx.plan);
  const allergies = clip(ctx.allergies) || "Not documented in this context.";
  const vitals = ctx.vitals || {};
  const vitalsLine = [
    vitals.bp ? `BP ${vitals.bp}` : "",
    vitals.pulse ? `Pulse ${vitals.pulse}` : "",
    vitals.rr ? `RR ${vitals.rr}` : "",
    vitals.spo2 ? `SpO₂ ${vitals.spo2}` : "",
    vitals.temperature ? `Temp ${vitals.temperature}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const history = nonEmpty(
    `Chief complaint / presenting concern: ${complaint}`,
    notes ? `Clinician notes: ${notes}` : "",
    `Allergies (from chart, if available): ${allergies}`,
  );

  const examination = nonEmpty(
    vitalsLine ? `Vitals: ${vitalsLine}` : "Vitals: not provided in this request context.",
    "Examination findings: complete based on bedside assessment (draft — clinician to edit).",
  );

  const assessment = nonEmpty(
    assessmentIn || (diagnosis ? `Working assessment related to: ${diagnosis}` : "Working assessment: to be completed by the clinician after review."),
    diagnosis ? `Documented diagnosis context: ${diagnosis}` : "",
    "Differential considerations should be refined by the responsible clinician.",
  );

  const plan = nonEmpty(
    planIn || "Plan: review investigations, supportive care, and follow-up as clinically indicated.",
    "Medication changes must be ordered only after clinician confirmation (AI does not prescribe).",
  );

  const followUp = "Follow-up: advise return if symptoms worsen; schedule review as clinically appropriate.";
  const patientInstructions =
    "Patient instructions (draft): take medicines only as prescribed by your clinician; seek urgent care for red-flag symptoms such as severe pain, breathing difficulty, or sudden deterioration.";

  const combined = formatCombined({
    history,
    examination,
    assessment,
    plan,
    followUp,
    patientInstructions,
  });

  return {
    history,
    examination,
    assessment,
    plan,
    followUp,
    patientInstructions,
    source: "heuristic",
    disclaimer: DISCLAIMER,
    combined,
  };
}

export function formatCombined(sections: ClinicalAiDraftSections): string {
  return [
    "[AI-GENERATED DRAFT — CLINICIAN REVIEW REQUIRED]",
    "",
    "History",
    sections.history,
    "",
    "Examination",
    sections.examination,
    "",
    "Assessment",
    sections.assessment,
    "",
    "Plan",
    sections.plan,
    "",
    "Follow-up",
    sections.followUp,
    "",
    "Patient instructions",
    sections.patientInstructions,
  ].join("\n");
}

/** Validate and coerce untrusted model output into safe structured draft sections. */
export function validateDraftSections(raw: unknown): ClinicalAiDraftSections | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const history = clip(o.history);
  const examination = clip(o.examination);
  const assessment = clip(o.assessment);
  const plan = clip(o.plan);
  const followUp = clip(o.followUp ?? o.follow_up);
  const patientInstructions = clip(o.patientInstructions ?? o.patient_instructions);
  if (![history, examination, assessment, plan, followUp, patientInstructions].some((s) => s.length > 0)) {
    return null;
  }
  return { history, examination, assessment, plan, followUp, patientInstructions };
}

function providerName(): "openai" | "gemini" | "none" {
  const configured = (process.env.CLINICAL_AI_PROVIDER || "").toLowerCase().trim();
  if (configured === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (configured === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "none";
}

async function callOpenAi(ctx: ClinicalAiContext): Promise<ClinicalAiDraftSections | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_CLINICAL_MODEL || "gpt-4o-mini";
  const system = [
    "You are a clinical documentation assistant for MedLum.",
    "Produce ONLY a JSON object with keys: history, examination, assessment, plan, followUp, patientInstructions.",
    "Each value is plain text. Do not diagnose definitively, prescribe medicines, or invent lab results.",
    "Use only the provided context. Mark uncertainty. Never claim to sign or finalize a record.",
  ].join(" ");
  const user = JSON.stringify({
    noteType: ctx.noteType || "Progress Note",
    patient: { age: ctx.age, gender: ctx.gender },
    chiefComplaint: ctx.chiefComplaint,
    clinicalNotes: ctx.clinicalNotes,
    diagnosis: ctx.diagnosis,
    assessment: ctx.assessment,
    plan: ctx.plan,
    vitals: ctx.vitals,
    allergies: ctx.allergies,
    clinicianNotes: ctx.clinicianNotes,
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  try {
    return validateDraftSections(JSON.parse(content));
  } catch {
    return null;
  }
}

async function callGemini(ctx: ClinicalAiContext): Promise<ClinicalAiDraftSections | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_CLINICAL_MODEL || "gemini-1.5-flash";
  const prompt = [
    "Return ONLY JSON with keys history, examination, assessment, plan, followUp, patientInstructions.",
    "Draft clinical documentation for clinician review. Do not prescribe or finalize.",
    JSON.stringify({
      noteType: ctx.noteType || "Progress Note",
      age: ctx.age,
      gender: ctx.gender,
      chiefComplaint: ctx.chiefComplaint,
      clinicalNotes: ctx.clinicalNotes,
      diagnosis: ctx.diagnosis,
      assessment: ctx.assessment,
      plan: ctx.plan,
      vitals: ctx.vitals,
      allergies: ctx.allergies,
      clinicianNotes: ctx.clinicianNotes,
    }),
  ].join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return validateDraftSections(JSON.parse(cleaned));
  } catch {
    return null;
  }
}

/** Generate a validated structured draft. Falls back to heuristic if provider unavailable. */
export async function generateClinicalDraft(ctx: ClinicalAiContext): Promise<ClinicalAiDraftResult> {
  const provider = providerName();
  try {
    if (provider === "openai") {
      const sections = await callOpenAi(ctx);
      if (sections) {
        return {
          ...sections,
          source: "openai",
          disclaimer: DISCLAIMER,
          combined: formatCombined(sections),
        };
      }
    }
    if (provider === "gemini") {
      const sections = await callGemini(ctx);
      if (sections) {
        return {
          ...sections,
          source: "gemini",
          disclaimer: DISCLAIMER,
          combined: formatCombined(sections),
        };
      }
    }
  } catch {
    /* fall through to heuristic */
  }
  return generateHeuristicDraft(ctx);
}

export function isClinicalAiConfigured(): boolean {
  return providerName() !== "none";
}
