import "server-only";

/**
 * Clinical AI draft assistant — structured DRAFT fields only.
 * Never finalizes, signs, or creates orders.
 *
 * Providers (optional, server-only):
 *   CLINICAL_AI_PROVIDER=none|openai|openai_compatible|gemini
 *   CLINICAL_AI_API_KEY=
 *   CLINICAL_AI_MODEL=   (e.g. gpt-4o-mini, gemini-2.0-flash)
 *   CLINICAL_AI_BASE_URL= (openai_compatible only)
 *
 * Without credentials, heuristic structuring of doctor-supplied text is used.
 */

export type ClinicalAiDraft = {
  chiefComplaint: string;
  clinicalNotes: string;
  examination: string;
  diagnosis: string;
  assessment: string;
  plan: string;
  followUp: string;
};

export type ClinicalAiDraftResult = {
  draft: ClinicalAiDraft;
  source: "heuristic" | "llm";
  provider: string;
  configured: boolean;
};

function emptyDraft(): ClinicalAiDraft {
  return {
    chiefComplaint: "",
    clinicalNotes: "",
    examination: "",
    diagnosis: "",
    assessment: "",
    plan: "",
    followUp: "",
  };
}

function providerConfig() {
  const provider = String(process.env.CLINICAL_AI_PROVIDER || "none").trim().toLowerCase();
  const apiKey = String(process.env.CLINICAL_AI_API_KEY || "").trim();
  const model = String(process.env.CLINICAL_AI_MODEL || "").trim();
  const baseUrl = String(process.env.CLINICAL_AI_BASE_URL || "").trim().replace(/\/$/, "");
  return { provider, apiKey, model, baseUrl };
}

export function isClinicalAiConfigured(): boolean {
  const { provider, apiKey } = providerConfig();
  if (!apiKey) return false;
  return provider === "openai" || provider === "openai_compatible" || provider === "gemini";
}

/** Heuristic field extraction from free-text dictation (no external call). */
export function heuristicClinicalDraft(sourceText: string): ClinicalAiDraft {
  const text = String(sourceText || "").trim();
  const draft = emptyDraft();
  if (!text) return draft;

  const valueAfter = (labels: string[]) => {
    const re = new RegExp(`(?:${labels.join("|")})\\s*[:\\-]?\\s*([^\\n]+)`, "i");
    return text.match(re)?.[1]?.trim() || "";
  };

  draft.chiefComplaint =
    valueAfter(["chief\\s*complaint", "c/o", "complaining\\s*of", "presenting\\s*complaint"]) ||
    text.split(/[.\n]/)[0]?.trim().slice(0, 240) ||
    "";
  draft.diagnosis = valueAfter(["final\\s*diagnosis", "diagnosis", "impression"]);
  draft.assessment = valueAfter(["assessment", "clinical\\s*impression"]);
  draft.plan = valueAfter(["plan", "management", "treatment\\s*plan", "advice"]);
  draft.examination = valueAfter(["examination", "on\\s*exam", "o/e", "physical\\s*exam"]);
  draft.followUp = valueAfter(["follow[- ]?up", "review\\s*in", "review\\s*after"]);

  // Remainder as clinical notes / HPI
  draft.clinicalNotes = text;
  return draft;
}

function parseJsonDraft(raw: string): ClinicalAiDraft {
  const draft = emptyDraft();
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return heuristicClinicalDraft(raw);
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const str = (k: string) => (typeof obj[k] === "string" ? String(obj[k]).trim() : "");
    draft.chiefComplaint = str("chiefComplaint") || str("chief_complaint");
    draft.clinicalNotes = str("clinicalNotes") || str("history") || str("hpi");
    draft.examination = str("examination") || str("exam");
    draft.diagnosis = str("diagnosis");
    draft.assessment = str("assessment");
    draft.plan = str("plan");
    draft.followUp = str("followUp") || str("follow_up");
    return draft;
  } catch {
    return heuristicClinicalDraft(raw);
  }
}

const SYSTEM_PROMPT = `You are a clinical documentation assistant. Given a clinician's notes or dictation, return ONLY a JSON object with keys:
chiefComplaint, clinicalNotes, examination, diagnosis, assessment, plan, followUp.
Use empty strings when unknown. Do not invent patient identifiers. Do not prescribe autonomously. Do not claim certainty. Draft only.`;

async function callOpenAiCompatible(input: {
  sourceText: string;
  age?: number;
  gender?: string;
}): Promise<string> {
  const { provider, apiKey, model, baseUrl } = providerConfig();
  const endpoint =
    provider === "openai_compatible" && baseUrl
      ? `${baseUrl}/chat/completions`
      : "https://api.openai.com/v1/chat/completions";
  const body = {
    model: model || "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          age: input.age ?? null,
          gender: input.gender ?? null,
          clinicianNotes: input.sourceText.slice(0, 8000),
        }),
      },
    ],
  };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new Error(String(json?.error?.message || `AI provider HTTP ${res.status}`));
  return String(json?.choices?.[0]?.message?.content || "");
}

async function callGemini(input: {
  sourceText: string;
  age?: number;
  gender?: string;
}): Promise<string> {
  const { apiKey, model } = providerConfig();
  const m = model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\nInput: ${JSON.stringify({
                age: input.age ?? null,
                gender: input.gender ?? null,
                clinicianNotes: input.sourceText.slice(0, 8000),
              })}`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.2 },
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new Error(String(json?.error?.message || `Gemini HTTP ${res.status}`));
  return String(json?.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

/**
 * Generate a structured clinical DRAFT from clinician-supplied text.
 * Does not accept patient name/phone/address — caller must strip PHI.
 */
export async function generateClinicalDraft(input: {
  sourceText: string;
  age?: number;
  gender?: string;
}): Promise<ClinicalAiDraftResult> {
  const text = String(input.sourceText || "").trim();
  if (!text) {
    return { draft: emptyDraft(), source: "heuristic", provider: "none", configured: false };
  }

  const cfg = providerConfig();
  if (!isClinicalAiConfigured()) {
    return {
      draft: heuristicClinicalDraft(text),
      source: "heuristic",
      provider: "none",
      configured: false,
    };
  }

  try {
    let raw = "";
    if (cfg.provider === "gemini") raw = await callGemini(input);
    else raw = await callOpenAiCompatible(input);
    return {
      draft: parseJsonDraft(raw),
      source: "llm",
      provider: cfg.provider,
      configured: true,
    };
  } catch (err) {
    console.error("[MedLum Clinical AI] provider failed; falling back to heuristic", {
      message: err instanceof Error ? err.message.slice(0, 160) : "unknown",
    });
    return {
      draft: heuristicClinicalDraft(text),
      source: "heuristic",
      provider: cfg.provider,
      configured: true,
    };
  }
}
