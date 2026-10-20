/**
 * Zero-cost OCR assist for lab reports.
 * Input bytes are processed in memory only. OCR output is ALWAYS a DRAFT.
 * Human verification is required before anything becomes clinical truth.
 */

import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

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
