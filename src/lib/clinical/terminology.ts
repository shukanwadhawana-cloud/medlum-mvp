export type ClinicalTerm = {
  phrase: string;
  preferred: string;
  category: "symptom" | "sign" | "diagnosis" | "investigation" | "procedure" | "clinical";
};

// Conservative clinician-facing terminology suggestions. These are suggestions,
// not automatic diagnoses. Ambiguous phrases are intentionally excluded.
export const CLINICAL_TERMS: ClinicalTerm[] = [
  { phrase: "breathlessness", preferred: "dyspnea", category: "symptom" },
  { phrase: "shortness of breath", preferred: "dyspnea", category: "symptom" },
  { phrase: "breathing difficulty", preferred: "dyspnea", category: "symptom" },
  { phrase: "chest pain", preferred: "chest pain", category: "symptom" },
  { phrase: "stomach pain", preferred: "abdominal pain", category: "symptom" },
  { phrase: "belly pain", preferred: "abdominal pain", category: "symptom" },
  { phrase: "vomiting", preferred: "emesis", category: "symptom" },
  { phrase: "throwing up", preferred: "emesis", category: "symptom" },
  { phrase: "loose motions", preferred: "diarrhea", category: "symptom" },
  { phrase: "loose stools", preferred: "diarrhea", category: "symptom" },
  { phrase: "constipation", preferred: "constipation", category: "symptom" },
  { phrase: "burning urination", preferred: "dysuria", category: "symptom" },
  { phrase: "painful urination", preferred: "dysuria", category: "symptom" },
  { phrase: "blood in urine", preferred: "hematuria", category: "symptom" },
  { phrase: "blood in stool", preferred: "hematochezia", category: "symptom" },
  { phrase: "black stools", preferred: "melena", category: "symptom" },
  { phrase: "yellow eyes", preferred: "scleral icterus", category: "sign" },
  { phrase: "yellowish eyes", preferred: "scleral icterus", category: "sign" },
  { phrase: "swelling of legs", preferred: "pedal edema", category: "sign" },
  { phrase: "leg swelling", preferred: "pedal edema", category: "sign" },
  { phrase: "ankle swelling", preferred: "pedal edema", category: "sign" },
  { phrase: "fainting", preferred: "syncope", category: "symptom" },
  { phrase: "passed out", preferred: "syncope", category: "symptom" },
  { phrase: "fits", preferred: "seizure", category: "symptom" },
  { phrase: "convulsions", preferred: "seizure activity", category: "symptom" },
  { phrase: "headache", preferred: "cephalgia", category: "symptom" },
  { phrase: "weakness of one side", preferred: "hemiparesis", category: "sign" },
  { phrase: "difficulty speaking", preferred: "dysphasia", category: "sign" },
  { phrase: "difficulty swallowing", preferred: "dysphagia", category: "symptom" },
  { phrase: "pain while swallowing", preferred: "odynophagia", category: "symptom" },
  { phrase: "loss of appetite", preferred: "anorexia", category: "symptom" },
  { phrase: "weight loss", preferred: "unintentional weight loss", category: "symptom" },
  { phrase: "weight gain", preferred: "weight gain", category: "symptom" },
  { phrase: "heart racing", preferred: "palpitations", category: "symptom" },
  { phrase: "fast heartbeat", preferred: "tachycardia", category: "sign" },
  { phrase: "slow heartbeat", preferred: "bradycardia", category: "sign" },
  { phrase: "high blood pressure", preferred: "hypertension / elevated blood pressure", category: "diagnosis" },
  { phrase: "low blood pressure", preferred: "hypotension", category: "sign" },
  { phrase: "high sugar", preferred: "hyperglycemia", category: "sign" },
  { phrase: "low sugar", preferred: "hypoglycemia", category: "sign" },
  { phrase: "high fever", preferred: "pyrexia", category: "sign" },
  { phrase: "fever", preferred: "pyrexia", category: "sign" },
  { phrase: "low oxygen", preferred: "hypoxemia", category: "sign" },
  { phrase: "low oxygen saturation", preferred: "arterial oxygen desaturation", category: "sign" },
  { phrase: "kidney failure", preferred: "renal failure", category: "diagnosis" },
  { phrase: "heart failure", preferred: "heart failure", category: "diagnosis" },
  { phrase: "liver failure", preferred: "hepatic failure", category: "diagnosis" },
  { phrase: "urine infection", preferred: "urinary tract infection", category: "diagnosis" },
  { phrase: "chest infection", preferred: "lower respiratory tract infection", category: "diagnosis" },
  { phrase: "lung infection", preferred: "pneumonia / lower respiratory tract infection", category: "diagnosis" },
  { phrase: "heart attack", preferred: "myocardial infarction", category: "diagnosis" },
  { phrase: "stroke", preferred: "cerebrovascular accident", category: "diagnosis" },
  { phrase: "blood clot", preferred: "thrombus", category: "diagnosis" },
  { phrase: "blood thinner", preferred: "anticoagulant", category: "clinical" },
  { phrase: "painkiller", preferred: "analgesic", category: "clinical" },
  { phrase: "water tablet", preferred: "diuretic", category: "clinical" },
  { phrase: "sleeping tablet", preferred: "hypnotic / sedative", category: "clinical" },
  { phrase: "sugar medicine", preferred: "antidiabetic medication", category: "clinical" },
  { phrase: "stomach medicine", preferred: "acid-suppressive / gastrointestinal medication", category: "clinical" },
  { phrase: "operation", preferred: "surgical procedure", category: "procedure" },
  { phrase: "camera test", preferred: "endoscopic examination", category: "procedure" },
  { phrase: "blood test", preferred: "laboratory investigation", category: "investigation" },
  { phrase: "kidney test", preferred: "renal function testing", category: "investigation" },
  { phrase: "liver test", preferred: "liver function testing", category: "investigation" },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectClinicalTerms(text: string): ClinicalTerm[] {
  const lower = text.toLocaleLowerCase();
  return CLINICAL_TERMS.filter((term) => new RegExp(`\\b${escapeRegExp(term.phrase.toLocaleLowerCase())}\\b`, "i").test(lower));
}

export function normalizeClinicalText(text: string): { text: string; detected: ClinicalTerm[] } {
  const detected = detectClinicalTerms(text);
  let normalized = text;
  for (const term of detected) {
    const pattern = new RegExp(`\\b${escapeRegExp(term.phrase)}\\b`, "gi");
    normalized = normalized.replace(pattern, term.preferred);
  }
  return { text: normalized, detected };
}
