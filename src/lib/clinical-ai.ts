/**
 * Server-only Clinical AI draft service.
 * AI is an assistant: structured DRAFT fields only. Never signs, finalizes,
 * prescribes, or creates orders. Works without any LLM credentials via heuristic fallback.
 *
 * PHI minimization: callers should send only clinical free text already entered
 * by the clinician (notes / dictation), not patient identifiers, phones, or facility secrets.
 */

export type ClinicalAiDraftFields = {
  chiefComplaint?: string;
  clinicalNotes?: string;
  history?: string;
  examination?: string;
  diagnosis?: string;
  assessment?: string;
  plan?: string;
  followUp?: string;
  medications?: string;
  allergies?: string;
  investigations?: string;
};

export type ClinicalAiDraftRequest = {
  sourceText: string;
  existing?: Partial<ClinicalAiDraftFields>;
  patientContext?: { age?: number | string; gender?: string };
};

export type ClinicalAiDraftResult = {
  draft: ClinicalAiDraftFields;
  provider: "heuristic" | "openai" | "gemini";
  model?: string;
  offline: boolean;
};

const DRAFT_KEYS: (keyof ClinicalAiDraftFields)[] = [
  "chiefComplaint",
  "clinicalNotes",
  "history",
  "examination",
  "diagnosis",
  "assessment",
  "plan",
  "followUp",
  "medications",
  "allergies",
  "investigations",
];

function cleanField(v: unknown, max = 2000): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\r/g, "").trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeDraft(raw: Record<string, unknown>): ClinicalAiDraftFields {
  const out: ClinicalAiDraftFields = {};
  for (const k of DRAFT_KEYS) {
    const c = cleanField(raw[k]);
    if (c) out[k] = c;
  }
  if (!out.clinicalNotes) {
    const hist = cleanField(raw.historyOfPresentIllness) || cleanField(raw.hpi) || cleanField(raw.history);
    if (hist) out.clinicalNotes = hist;
  }
  if (!out.plan) {
    const p = cleanField(raw.treatmentPlan) || cleanField(raw.management);
    if (p) out.plan = p;
  }
  if (!out.followUp) {
    const f = cleanField(raw.followUpDate) || cleanField(raw.follow_up);
    if (f) out.followUp = f;
  }
  return out;
}

/** Zero-cost structured draft from clinician-provided text. Does not invent diagnoses. */
export function heuristicClinicalDraft(req: ClinicalAiDraftRequest): ClinicalAiDraftResult {
  const text = String(req.sourceText || "").trim();
  const existing = req.existing || {};
  const draft: ClinicalAiDraftFields = {};

  const take = (key: keyof ClinicalAiDraftFields, value?: string) => {
    const v = cleanField(value);
    if (v) draft[key] = v;
  };

  for (const k of DRAFT_KEYS) {
    if (existing[k]) take(k, existing[k]);
  }

  if (!text) {
    return { draft, provider: "heuristic", offline: true };
  }

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const joined = lines.join("\n");

  const valueAfter = (labels: string[], maxLen = 400): string | undefined => {
    const re = new RegExp(`(?:${labels.join("|")})\\s*[:\\-–]?\\s*([^\\n]+)`, "i");
    const m = joined.match(re);
    return cleanField(m?.[1], maxLen);
  };

  if (!draft.chiefComplaint) {
    take(
      "chiefComplaint",
      valueAfter(["chief\\s*complaint", "c\\/?o", "presenting\\s*complaint", "complaint"], 300) ||
        lines[0]?.slice(0, 200)
    );
  }
  if (!draft.diagnosis) {
    take("diagnosis", valueAfter(["final\\s*diagnosis", "provisional\\s*diagnosis", "diagnosis", "impression", "dx"], 400));
  }
  if (!draft.assessment) {
    take("assessment", valueAfter(["assessment", "clinical\\s*impression", "impression"], 800));
  }
  if (!draft.plan) {
    take("plan", valueAfter(["plan", "treatment\\s*plan", "management", "advice", "recommendations"], 1000));
  }
  if (!draft.followUp) {
    take("followUp", valueAfter(["follow[- ]?up", "review\\s*after", "rtc", "return\\s*in"], 200));
  }
  if (!draft.medications) {
    take("medications", valueAfter(["medications?", "medicines?", "rx", "prescription", "drugs?"], 600));
  }
  if (!draft.allergies) {
    take("allergies", valueAfter(["allerg(?:y|ies)", "nkda", "drug\\s*allerg"], 300));
  }
  if (!draft.investigations) {
    take("investigations", valueAfter(["investigations?", "labs?", "lab\\s*orders?", "diagnostics?", "tests?"], 600));
  }
  if (!draft.examination) {
    take("examination", valueAfter(["examination", "exam", "o\\/?e", "on\\s*examination", "findings"], 800));
  }
  if (!draft.clinicalNotes) {
    const note = cleanField(joined, 4000);
    if (note) draft.clinicalNotes = note;
  }

  return { draft, provider: "heuristic", offline: true };
}

type ProviderConfig =
  | { kind: "openai"; apiKey: string; baseUrl: string; model: string }
  | { kind: "gemini"; apiKey: string; model: string }
  | { kind: "none" };

function resolveProvider(): ProviderConfig {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim();
  const preferred = (process.env.CLINICAL_AI_PROVIDER || "").trim().toLowerCase();

  if (preferred === "openai" && openaiKey) {
    return {
      kind: "openai",
      apiKey: openaiKey,
      baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
      model: process.env.CLINICAL_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  if (preferred === "gemini" && geminiKey) {
    return {
      kind: "gemini",
      apiKey: geminiKey,
      model: process.env.CLINICAL_AI_MODEL || process.env.GEMINI_MODEL || "gemini-1.5-flash",
    };
  }
  if (openaiKey) {
    return {
      kind: "openai",
      apiKey: openaiKey,
      baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
      model: process.env.CLINICAL_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  if (geminiKey) {
    return {
      kind: "gemini",
      apiKey: geminiKey,
      model: process.env.CLINICAL_AI_MODEL || process.env.GEMINI_MODEL || "gemini-1.5-flash",
    };
  }
  return { kind: "none" };
}

const SYSTEM_PROMPT = `You are a clinical documentation assistant for a licensed clinician.
Return ONLY valid JSON with optional keys:
chiefComplaint, clinicalNotes, history, examination, diagnosis, assessment, plan, followUp, medications, allergies, investigations.
Rules:
- Organize and structure the clinician's own notes. Do not invent diagnoses, meds, or findings not supported by the input.
- Do not prescribe or order labs. Suggestions in plan/investigations must be clearly draft language.
- Never include patient name, phone, address, or identifiers.
- Keep each field concise clinical prose.
- If input is empty or insufficient, return {}.`;

async function callOpenAiCompatible(
  cfg: Extract<ProviderConfig, { kind: "openai" }>,
  userContent: string
): Promise<ClinicalAiDraftFields> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI-compatible provider error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content || "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }
  return normalizeDraft(parsed);
}

async function callGemini(
  cfg: Extract<ProviderConfig, { kind: "gemini" }>,
  userContent: string
): Promise<ClinicalAiDraftFields> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\nClinician notes:\n${userContent}` }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini provider error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }
  return normalizeDraft(parsed);
}

function buildUserContent(req: ClinicalAiDraftRequest): string {
  const parts: string[] = [];
  if (req.patientContext?.age != null || req.patientContext?.gender) {
    parts.push(
      `Patient context (no identifiers): age=${req.patientContext.age ?? "—"}, gender=${req.patientContext.gender ?? "—"}`
    );
  }
  if (req.existing && Object.keys(req.existing).length) {
    parts.push(`Existing form fields:\n${JSON.stringify(req.existing)}`);
  }
  parts.push(`Clinician source text:\n${String(req.sourceText || "").slice(0, 6000)}`);
  return parts.join("\n\n");
}

/** Generate structured clinical DRAFT. Falls back to heuristic when no provider or on failure. */
export async function generateClinicalDraft(req: ClinicalAiDraftRequest): Promise<ClinicalAiDraftResult> {
  const source = String(req.sourceText || "").trim();
  if (!source && !(req.existing && Object.keys(req.existing).some((k) => Boolean((req.existing as Record<string, unknown>)[k])))) {
    return heuristicClinicalDraft(req);
  }

  const cfg = resolveProvider();
  if (cfg.kind === "none") {
    return heuristicClinicalDraft(req);
  }

  try {
    const userContent = buildUserContent(req);
    if (cfg.kind === "openai") {
      const draft = await callOpenAiCompatible(cfg, userContent);
      const merged = { ...req.existing, ...draft };
      return {
        draft: normalizeDraft(merged as Record<string, unknown>),
        provider: "openai",
        model: cfg.model,
        offline: false,
      };
    }
    if (cfg.kind === "gemini") {
      const draft = await callGemini(cfg, userContent);
      const merged = { ...req.existing, ...draft };
      return {
        draft: normalizeDraft(merged as Record<string, unknown>),
        provider: "gemini",
        model: cfg.model,
        offline: false,
      };
    }
  } catch (e) {
    console.error("clinical-ai provider failed, using heuristic fallback", e instanceof Error ? e.message : e);
  }
  return heuristicClinicalDraft(req);
}
