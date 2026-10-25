import { strict as assert } from "node:assert";
import { extractCandidates } from "../src/lib/lab-ocr";

const cases: Array<{ name: string; input: string; expected: Record<string, string> }> = [
  {
    name: "numeric value with unit",
    input: "Hemoglobin 13.2 g/dL",
    expected: { Hemoglobin: "13.2 g/dL" },
  },
  {
    name: "numeric value without unit and reference interval",
    input: "Hemoglobin 13.2 13-17",
    expected: { Hemoglobin: "13.2" },
  },
  {
    name: "decimal comma normalized",
    input: "Creatinine 1,4 mg/dL",
    expected: { Creatinine: "1.4 mg/dL" },
  },
  {
    name: "value on adjacent OCR column line",
    input: "Hemoglobin\n13.2 g/dL 13-17",
    expected: { Hemoglobin: "13.2 g/dL" },
  },
  {
    name: "multiple analytes remain distinct",
    input: "Hemoglobin 13.2 g/dL\nWBC 7.4 4-11\nPlatelets 220 150-400",
    expected: { Hemoglobin: "13.2 g/dL", "Total WBC": "7.4", Platelets: "220" },
  },
  {
    name: "does not attach reference range as value",
    input: "Hemoglobin 13-17",
    expected: {},
  },
  {
    name: "coagulation report extracts prothrombin time and INR separately",
    input: "Prothrombin Time 13.8 seconds 11-15\nINR 1.12 0.8-1.2\nAPTT 31 sec 25-35",
    expected: { "Prothrombin Time": "13.8 seconds", INR: "1.12", APTT: "31 sec" },
  },
  {
    name: "combined PT/INR line maps both values without guessing",
    input: "PT/INR 13.8 seconds (11-15) / 1.12 (0.8-1.2)",
    expected: { "Prothrombin Time": "13.8 seconds", INR: "1.12" },
  },
  {
    name: "combined PT/INR line with a single result stays generic",
    input: "PT/INR 1.12",
    expected: { "PT/INR": "1.12" },
  },

  {
    name: "renal-function panel maps urea and creatinine separately",
    input: "Blood Urea 32 mg/dL\nCreatinine 0.9 mg/dL",
    expected: { Urea: "32 mg/dL", Creatinine: "0.9 mg/dL" },
  },
  {
    name: "electrolyte panel maps sodium potassium and chloride",
    input: "Sodium 140 mmol/L\nPotassium 4.1 mmol/L\nChloride 102 mmol/L",
    expected: { Sodium: "140 mmol/L", Potassium: "4.1 mmol/L", Chloride: "102 mmol/L" },
  },
  {
    name: "liver-function panel maps bilirubin enzymes and albumin",
    input: "Total Bilirubin 0.8 mg/dL\nAST 22 U/L\nALT 19 U/L\nALP 88 U/L\nAlbumin 4.2 g/dL",
    expected: {
      "Total Bilirubin": "0.8 mg/dL",
      AST: "22 U/L",
      ALT: "19 U/L",
      ALP: "88 U/L",
      Albumin: "4.2 g/dL",
    },
  },
  {
    name: "thyroid panel maps TSH and free thyroid hormones",
    input: "TSH 2.4 mIU/L\nFree T4 1.2 ng/dL\nFree T3 3.0 pg/mL",
    expected: { TSH: "2.4 mIU/L", "Free T4": "1.2 ng/dL", "Free T3": "3.0 pg/mL" },
  },
  {
    name: "mg/dL units do not invent a Magnesium candidate",
    input: "Creatinine 1.2 mg/dL\nGlucose 130 mg/dL",
    expected: { Creatinine: "1.2 mg/dL", Glucose: "130 mg/dL" },
  },
  {
    name: "Magnesium requires its explicit analyte label",
    input: "Magnesium 2.0 mg/dL\nCreatinine 0.8 mg/dL",
    expected: { Magnesium: "2.0 mg/dL", Creatinine: "0.8 mg/dL" },
  },
];

for (const testCase of cases) {
  assert.deepEqual(extractCandidates(testCase.input), testCase.expected, testCase.name);
  console.log("OK:", testCase.name);
}

console.log("Lab OCR behavioral regression tests PASSED");
