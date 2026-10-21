/** Browser-safe lab value candidate extraction shared by server OCR and the on-device Clinical Assist fallback. */

const LAB_ALIASES: Record<string, string[]> = {
  Hemoglobin: ["hemoglobin", "haemoglobin", "hb", "hgb"],
  "Total WBC": ["total wbc", "wbc", "tlc", "total leucocyte", "total leukocyte"],
  Neutrophils: ["neutrophil", "neut"],
  Lymphocytes: ["lymphocyte", "lymph"],
  Monocytes: ["monocyte", "mono"],
  Eosinophils: ["eosinophil", "eos"],
  Basophils: ["basophil", "baso"],
  Platelets: ["platelets", "platelet", "plt"],
  RBC: ["rbc", "red blood cell"],
  HCT: ["hct", "hematocrit", "haematocrit", "pcv"],
  MCV: ["mcv"],
  MCH: ["mch"],
  MCHC: ["mchc"],
  RDW: ["rdw"],
  Glucose: ["glucose", "blood sugar", "fbs", "fasting glucose", "ppbs", "random glucose"],
  "HbA1c": ["hba1c", "hb a1c", "glycated hemoglobin", "glycosylated hemoglobin"],
  Creatinine: ["creatinine", "serum creatinine"],
  Urea: ["urea", "blood urea"],
  Sodium: ["sodium", "na+"],
  Potassium: ["potassium", "k+"],
  Chloride: ["chloride", "cl-"],
  "Total Bilirubin": ["total bilirubin", "bilirubin total"],
  "Direct Bilirubin": ["direct bilirubin", "bilirubin direct"],
  AST: ["ast", "sgot"],
  ALT: ["alt", "sgpt"],
  ALP: ["alp", "alkaline phosphatase"],
  Albumin: ["albumin", "serum albumin"],
  TSH: ["tsh", "thyroid stimulating hormone"],
  "Free T4": ["free t4", "ft4"],
  "Free T3": ["free t3", "ft3"],
  "Total Cholesterol": ["total cholesterol", "cholesterol total"],
  Triglycerides: ["triglycerides", "triglyceride"],
  "HDL Cholesterol": ["hdl", "hdl cholesterol"],
  "LDL Cholesterol": ["ldl", "ldl cholesterol"],
  "Total Protein": ["total protein", "protein total"],
  Globulin: ["globulin"],
  Calcium: ["calcium", "ca"],
  Magnesium: ["magnesium", "mg"],
  Phosphorus: ["phosphorus", "phosphate", "phos"],
  "Uric Acid": ["uric acid", "uric"],
  Amylase: ["amylase"],
  Lipase: ["lipase"],
  Ferritin: ["ferritin"],
  "Vitamin B12": ["vitamin b12", "vit b12", "b12"],
  Folate: ["folate", "folic acid"],
  CRP: ["crp", "c-reactive protein", "c reactive protein"],
  ESR: ["esr", "erythrocyte sedimentation rate"],
  "Procalcitonin": ["procalcitonin", "pct"],
  "D-Dimer": ["d-dimer", "d dimer", "ddimer"],
  Troponin: ["troponin", "hs-troponin", "hs troponin"],
  "NT-proBNP": ["nt-probnp", "nt probnp", "bnp"],
  "Free PSA": ["free psa"],
  PSA: ["psa", "prostate specific antigen"],
  LH: ["lh", "luteinizing hormone"],
  FSH: ["fsh", "follicle stimulating hormone"],
  Prolactin: ["prolactin"],
  Cortisol: ["cortisol"],
  Insulin: ["insulin"],
  "Vitamin D": ["vitamin d", "25-oh vitamin d", "25 oh vitamin d"],
  "Urine Protein": ["urine protein", "protein urine"],
  "Urine Glucose": ["urine glucose"],
  "Urine RBC": ["urine rbc", "rbc/hpf"],
  "Urine WBC": ["urine wbc", "pus cells", "wbc/hpf"],
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}

const LAB_UNITS =
  /(?:mg\/dL|g\/dL|g\/L|mmol\/L|µmol\/L|U\/L|IU\/L|mIU\/L|ng\/mL|pg\/mL|ng\/dL|mg\/L|mm\/hr|%|fL|pg|cells\/µL|\/hpf)/i;

function normalizeOcrLines(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[|]+/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function extractValueFromSegment(segment: string): string | null {
  const withUnit = new RegExp(
    "([<>]?\\d+(?:[.,]\\d+)?)\\s*(" + LAB_UNITS.source + ")",
    "i"
  ).exec(segment);
  if (withUnit?.[1]) return withUnit[1].replace(",", ".") + (withUnit[2] ? " " + withUnit[2] : "");
  const numeric = /[<>]?\d+(?:[.,]\d+)?/g;
  for (const match of segment.matchAll(numeric)) {
    const start = match.index ?? 0;
    const value = match[0];
    const before = segment[start - 1] ?? "";
    const after = segment[start + value.length] ?? "";
    if (before === "-" || after === "-") continue;
    return value.replace(",", ".");
  }
  return null;
}

export function extractCandidates(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = normalizeOcrLines(text);
  for (const [canonical, aliases] of Object.entries(LAB_ALIASES)) {
    const orderedAliases = [...aliases].sort((a, b) => b.length - a.length);
    for (let i = 0; i < lines.length && !out[canonical]; i += 1) {
      const line = lines[i];
      for (const alias of orderedAliases) {
        const aliasRe = new RegExp(
          "(^|[^a-z0-9])" + escapeRegExp(alias) + "([^a-z0-9]|$)",
          "i"
        );
        const match = aliasRe.exec(line);
        if (!match) continue;
        const afterAlias = line.slice(match.index + match[0].length);
        const direct = extractValueFromSegment(afterAlias);
        if (direct) {
          out[canonical] = direct;
          break;
        }
        for (let offset = 1; offset <= 2 && i + offset < lines.length; offset += 1) {
          const nearby = extractValueFromSegment(lines[i + offset]);
          if (nearby) {
            out[canonical] = nearby;
            break;
          }
        }
        if (out[canonical]) break;
      }
    }
  }
  return out;
}
