export type ClinicalTerm = {
  phrase: string;
  preferred: string;
  category: "symptom" | "sign" | "diagnosis" | "investigation" | "procedure" | "clinical";
};

// Free, conservative clinician-facing terminology suggestions. These are
// normalization aids, not diagnostic rules. Ambiguous phrases are excluded.
export const CLINICAL_TERMS: ClinicalTerm[] = [
  { phrase: "breathlessness", preferred: "dyspnea", category: "symptom" },
  { phrase: "shortness of breath", preferred: "dyspnea", category: "symptom" },
  { phrase: "breathing difficulty", preferred: "dyspnea", category: "symptom" },
  { phrase: "stomach pain", preferred: "abdominal pain", category: "symptom" },
  { phrase: "belly pain", preferred: "abdominal pain", category: "symptom" },
  { phrase: "vomiting", preferred: "emesis", category: "symptom" },
  { phrase: "throwing up", preferred: "emesis", category: "symptom" },
  { phrase: "loose motions", preferred: "diarrhea", category: "symptom" },
  { phrase: "loose stools", preferred: "diarrhea", category: "symptom" },
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
  { phrase: "heart racing", preferred: "palpitations", category: "symptom" },
  { phrase: "fast heartbeat", preferred: "tachycardia", category: "sign" },
  { phrase: "slow heartbeat", preferred: "bradycardia", category: "sign" },
  { phrase: "high blood pressure", preferred: "hypertension / elevated blood pressure", category: "diagnosis" },
  { phrase: "low blood pressure", preferred: "hypotension", category: "sign" },
  { phrase: "high sugar", preferred: "hyperglycemia", category: "sign" },
  { phrase: "low sugar", preferred: "hypoglycemia", category: "sign" },
  { phrase: "fever", preferred: "pyrexia", category: "sign" },
  { phrase: "low oxygen", preferred: "hypoxemia", category: "sign" },
  { phrase: "low oxygen saturation", preferred: "oxygen desaturation", category: "sign" },
  { phrase: "kidney failure", preferred: "renal failure", category: "diagnosis" },
  { phrase: "liver failure", preferred: "hepatic failure", category: "diagnosis" },
  { phrase: "urine infection", preferred: "urinary tract infection", category: "diagnosis" },
  { phrase: "chest infection", preferred: "lower respiratory tract infection", category: "diagnosis" },
  { phrase: "lung infection", preferred: "pneumonia / lower respiratory tract infection", category: "diagnosis" },
  { phrase: "heart attack", preferred: "myocardial infarction", category: "diagnosis" },
  { phrase: "stroke", preferred: "cerebrovascular accident", category: "diagnosis" },
  { phrase: "blood clot", preferred: "thrombus", category: "clinical" },
  { phrase: "blood thinner", preferred: "anticoagulant", category: "clinical" },
  { phrase: "painkiller", preferred: "analgesic", category: "clinical" },
  { phrase: "water tablet", preferred: "diuretic", category: "clinical" },
  { phrase: "sleeping tablet", preferred: "hypnotic / sedative", category: "clinical" },
  { phrase: "sugar medicine", preferred: "antidiabetic medication", category: "clinical" },
  { phrase: "stomach medicine", preferred: "gastrointestinal medication", category: "clinical" },
  { phrase: "operation", preferred: "surgical procedure", category: "procedure" },
  { phrase: "camera test", preferred: "endoscopic examination", category: "procedure" },
  { phrase: "blood test", preferred: "laboratory investigation", category: "investigation" },
  { phrase: "kidney test", preferred: "renal function testing", category: "investigation" },
  { phrase: "liver test", preferred: "liver function testing", category: "investigation" },
  // Common clinician shorthand / documentation vocabulary.
  { phrase: "history of", preferred: "h/o", category: "clinical" },
  { phrase: "history", preferred: "history", category: "clinical" },
  { phrase: "on examination", preferred: "O/E", category: "clinical" },
  { phrase: "examination", preferred: "examination", category: "clinical" },
  { phrase: "no history of", preferred: "no h/o", category: "clinical" },
  { phrase: "complaining of", preferred: "c/o", category: "clinical" },
  { phrase: "chief complaint", preferred: "chief complaint", category: "clinical" },
  { phrase: "blood pressure", preferred: "BP", category: "investigation" },
  { phrase: "oxygen saturation", preferred: "SpO2", category: "investigation" },
  { phrase: "pulse rate", preferred: "PR", category: "investigation" },
  { phrase: "respiratory rate", preferred: "RR", category: "investigation" },
  { phrase: "temperature", preferred: "temperature", category: "investigation" },
  { phrase: "complete blood count", preferred: "CBC", category: "investigation" },
  { phrase: "hemoglobin", preferred: "Hb", category: "investigation" },
  { phrase: "white blood cell count", preferred: "WBC count", category: "investigation" },
  { phrase: "platelet count", preferred: "platelet count", category: "investigation" },
  { phrase: "serum creatinine", preferred: "S. creatinine", category: "investigation" },
  { phrase: "blood urea nitrogen", preferred: "BUN", category: "investigation" },
  { phrase: "liver function test", preferred: "LFT", category: "investigation" },
  { phrase: "renal function test", preferred: "RFT", category: "investigation" },
  { phrase: "electrocardiogram", preferred: "ECG", category: "investigation" },
  { phrase: "echocardiogram", preferred: "ECHO", category: "investigation" },
  { phrase: "computed tomography", preferred: "CT", category: "investigation" },
  { phrase: "magnetic resonance imaging", preferred: "MRI", category: "investigation" },
  { phrase: "ultrasonography", preferred: "USG", category: "investigation" },
  { phrase: "chest x-ray", preferred: "CXR", category: "investigation" },
  { phrase: "random blood sugar", preferred: "RBS", category: "investigation" },
  { phrase: "fasting blood sugar", preferred: "FBS", category: "investigation" },
  { phrase: "postprandial blood sugar", preferred: "PPBS", category: "investigation" },
  { phrase: "glycated hemoglobin", preferred: "HbA1c", category: "investigation" },
  { phrase: "urine routine microscopy", preferred: "urine R/M", category: "investigation" },
  { phrase: "intravenous", preferred: "IV", category: "clinical" },
  { phrase: "intramuscular", preferred: "IM", category: "clinical" },
  { phrase: "subcutaneous", preferred: "SC", category: "clinical" },
  { phrase: "oral", preferred: "PO", category: "clinical" },
  { phrase: "twice daily", preferred: "BD", category: "clinical" },
  { phrase: "three times daily", preferred: "TDS", category: "clinical" },
  { phrase: "four times daily", preferred: "QID", category: "clinical" },
  { phrase: "once daily", preferred: "OD", category: "clinical" },
  { phrase: "at bedtime", preferred: "HS", category: "clinical" },
  { phrase: "as needed", preferred: "SOS", category: "clinical" },
  { phrase: "nothing by mouth", preferred: "NPO", category: "clinical" },
  { phrase: "before meals", preferred: "AC", category: "clinical" },
  { phrase: "after meals", preferred: "PC", category: "clinical" },
  { phrase: "follow up", preferred: "follow-up", category: "clinical" },
  { phrase: "follow-up", preferred: "follow-up", category: "clinical" },
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
  // Longer phrases first prevents a short phrase from partially consuming a
  // more specific clinical phrase.
  [...detected].sort((a, b) => b.phrase.length - a.phrase.length).forEach((term) => {
    const pattern = new RegExp(`\\b${escapeRegExp(term.phrase)}\\b`, "gi");
    normalized = normalized.replace(pattern, term.preferred);
  });
  return { text: normalized, detected };
}
