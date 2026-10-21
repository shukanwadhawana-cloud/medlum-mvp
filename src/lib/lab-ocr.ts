/**
 * Zero-cost OCR assist for lab reports.
 * Input bytes are processed in memory only. OCR output is ALWAYS a DRAFT.
 * Human verification is required before anything becomes clinical truth.
 */

import { createRequire } from "node:module";
import { extractClinicalOcrText } from "@/lib/clinical-ocr";

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
  "Prothrombin Time": ["prothrombin time", "prothrombin", "pt seconds", "pt sec", "pt/sec"],
  INR: ["international normalized ratio", "inr"],
  APTT: ["activated partial thromboplastin time", "partial thromboplastin time", "aptt", "ptt"],
  Fibrinogen: ["fibrinogen"],
  "Thrombin Time": ["thrombin time"],
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
  /(?:mg\/dL|g\/dL|g\/L|mmol\/L|µmol\/L|U\/L|IU\/L|mIU\/L|ng\/mL|pg\/mL|ng\/dL|mg\/L|mm\/hr|seconds?|sec|%|fL|pg|cells\/µL|\/hpf)/i;

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

  // PT/INR reports sometimes print both analytes after one combined label.
  // Only split the pair when two distinct result numbers are present; if only
  // one is visible, retain it as a generic PT/INR candidate instead of guessing
  // whether it represents PT or INR.
  const combinedPtInrLabel = /\b(?:prothrombin time\s*\/\s*inr|pt\s*\/\s*inr|pt\s+inr)\b/i;
  for (const line of lines) {
    const label = combinedPtInrLabel.exec(line);
    if (!label) continue;
    const segment = line.slice(label.index + label[0].length);
    const numbers: string[] = [];
    const numeric = /([<>]?\d+(?:[.,]\d+)?)(?:\s*(seconds?|sec))?/ig;
    for (const match of segment.matchAll(numeric)) {
      const start = match.index ?? 0;
      const value = match[1];
      const before = segment[start - 1] ?? "";
      const after = segment[start + value.length] ?? "";
      if (before === "-" || after === "-") continue;
      numbers.push(value.replace(",", ".") + (match[2] ? " " + match[2] : ""));
    }
    if (numbers.length >= 2) {
      out["Prothrombin Time"] ??= numbers[0];
      out.INR ??= numbers[1];
    } else if (numbers.length === 1) {
      out["PT/INR"] ??= numbers[0];
    }
  }

  for (const [canonical, aliases] of Object.entries(LAB_ALIASES)) {
    const orderedAliases = [...aliases].sort((a, b) => b.length - a.length);
    for (let i = 0; i < lines.length && !out[canonical]; i += 1) {
      const line = lines[i];
      // Do not map the single number in a combined PT/INR row to INR alone.
      if (combinedPtInrLabel.test(line) && (canonical === "INR" || canonical === "Prothrombin Time")) continue;
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

async function ocrImage(data: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const workerPath = nodeRequire.resolve(
    "tesseract.js/src/worker-script/node/index.js"
  );
  const worker = await createWorker("eng", 1, {
    workerPath,
    cachePath: "/tmp/medlum-tessdata",
    cacheMethod: "write",
  });
  try {
    const result = await worker.recognize(data);
    return String(result?.data?.text || "");
  } finally {
    await worker.terminate();
  }
}

async function extractPdf(
  data: Buffer
): Promise<{ text: string; scannedOcrText: string; pagesOcr: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(data),
  }).promise;
  const textParts: string[] = [];
  const maxPagesForOcr = Math.min(document.numPages, 5);
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      textParts.push(
        content.items
          .map((item) => ("str" in item ? item.str : "") || "")
          .join(" ")
      );
      page.cleanup();
    }
    const text = textParts.join("\n");
    if (Object.keys(extractCandidates(text)).length > 0) {
      return { text, scannedOcrText: "", pagesOcr: 0 };
    }
    const { createCanvas } = await import("@napi-rs/canvas");
    class NodeCanvasFactory {
      create(width: number, height: number) {
        const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
        return { canvas, context: canvas.getContext("2d") };
      }
      reset(
        cc: { canvas: { width: number; height: number }; context: unknown },
        width: number,
        height: number
      ) {
        cc.canvas.width = Math.ceil(width);
        cc.canvas.height = Math.ceil(height);
      }
      destroy(cc: {
        canvas: { width: number; height: number };
        context: unknown;
      }) {
        cc.canvas.width = 0;
        cc.canvas.height = 0;
      }
    }
    const ocrParts: string[] = [];
    for (let pageNumber = 1; pageNumber <= maxPagesForOcr; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.8 });
      const factory = new NodeCanvasFactory();
      const { canvas, context } = factory.create(viewport.width, viewport.height);
      await page.render({
        canvasContext: context as any,
        viewport,
        canvasFactory: factory,
      } as any).promise;
      ocrParts.push(await ocrImage(canvas.toBuffer("image/png")));
      factory.destroy({ canvas, context });
      page.cleanup();
    }
    return {
      text,
      scannedOcrText: ocrParts.join("\n"),
      pagesOcr: maxPagesForOcr,
    };
  } finally {
    await document.destroy();
  }
}

export type OcrAssistResult = {
  status: "DRAFT" | "FAILED";
  draft: Record<string, string>;
  rawTextPreview: string;
  message: string;
  warnings?: string[];
};

export async function extractLabOcrDraft(
  data: Buffer,
  mimeType: string
): Promise<OcrAssistResult> {
  const warnings: string[] = [];
  let text = "";
  let draft: Record<string, string> = {};
  let primaryFailed = false;

  // Keep the current lab-specific parser, but do not let a Tesseract worker or
  // PDF primary-pass error skip the stronger Clinical Assist fallback.
  try {
    if (mimeType === "application/pdf") {
      const pdf = await extractPdf(data);
      text = [pdf.text, pdf.scannedOcrText].filter(Boolean).join("\n");
      if (pdf.pagesOcr > 0) {
        warnings.push(
          "Primary PDF pass had no usable text-layer values; OCR fallback scanned up to " +
            pdf.pagesOcr +
            " page(s)."
        );
      }
    } else if (mimeType.startsWith("image/") || mimeType === "image/jpg") {
      text = await ocrImage(data);
    } else {
      return {
        status: "FAILED",
        draft: {},
        rawTextPreview: "",
        message: "Unsupported document type for OCR assist",
        warnings: ["Supported report formats are PDF, JPEG and PNG."],
      };
    }
    draft = extractCandidates(text);
  } catch (error) {
    primaryFailed = true;
    warnings.push(
      "Initial lab OCR pass failed: " +
        (error instanceof Error ? error.message : "unknown OCR error")
    );
  }

  // Run the same enhanced extraction path used by Clinical Assist when the
  // primary engine failed or could not map enough lab values. This is important
  // for photographed tables, where the first pass can return text but no values.
  if (primaryFailed || Object.keys(draft).length < 4) {
    try {
      const enhanced = await extractClinicalOcrText(data, mimeType);
      const enhancedText = String(enhanced.text || "").trim();
      const enhancedDraft = extractCandidates(enhancedText);

      // Merge candidates from both OCR passes; prefer the regular lab pass for
      // keys it identified, then fill gaps from Clinical Assist.
      draft = { ...enhancedDraft, ...draft };
      if (enhancedText.length > text.length || primaryFailed) text = enhancedText;
      warnings.push(
        "Clinical Assist enhanced OCR used " +
          enhanced.method +
          (enhanced.confidence == null
            ? ""
            : " (confidence " + Math.round(enhanced.confidence) + "%)") +
          "."
      );
      if (enhanced.pageLimitReached) {
        warnings.push("Only the supported first pages of this PDF were OCR processed.");
      }
    } catch (error) {
      warnings.push(
        "Clinical Assist enhanced OCR did not complete: " +
          (error instanceof Error ? error.message : "unknown OCR error")
      );
    }
  }

  if (Object.keys(draft).length === 0) {
    const hasText = text.trim().length >= 20;
    return {
      status: "FAILED",
      draft: {},
      rawTextPreview: text.slice(0, 4000),
      message: hasText
        ? "Clinical Assist extracted text, but could not safely map supported lab values. Review the extracted text and enter/correct the findings manually."
        : "Clinical Assist could not read enough text from this report. Try a clearer, upright image or a PDF; the extracted text area is available for review if any text was recovered.",
      warnings,
    };
  }

  return {
    status: "DRAFT",
    draft,
    rawTextPreview: text.slice(0, 4000),
    message:
      "Clinical Assist prepared an editable lab-result draft. Check every value and unit against the original report before verifying.",
    warnings,
  };
}
