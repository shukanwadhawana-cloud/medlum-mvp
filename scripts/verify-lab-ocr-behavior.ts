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
];

for (const testCase of cases) {
  assert.deepEqual(extractCandidates(testCase.input), testCase.expected, testCase.name);
  console.log("OK:", testCase.name);
}

console.log("Lab OCR behavioral regression tests PASSED");
