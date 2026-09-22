/**
 * Zero-cost OCR assist for lab reports.
 * OCR output is always a DRAFT for human verification. Never invents values.
 */

const CBC_ALIASES: Record<string, string[]> = {
  Hemoglobin: ["hemoglobin", "haemoglobin", "hb", "hgb"],
  "Total WBC": ["total wbc", "wbc", "tlc", "leukocyte"],
  Neutrophils: ["neutrophil", "neut"],
  Lymphocytes: ["lymphocyte", "lymph"],
  Monocytes: ["monocyte", "mono"],
  Eosinophils: ["eosinophil", "eos"],
  Basophils: ["basophil", "baso"],
  Platelets: ["platelet", "plt"],
  RBC: ["rbc", "red blood cell"],
  HCT: ["hct", "hematocrit", "haematocrit", "pcv"],
  MCV: ["mcv"],
  MCH: ["mch"],
  MCHC: ["mchc"],
  RDW: ["rdw"],
};

function extractCandidates(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const normalized = text.replace(/\r/g, "\n");
  for (const [canonical, aliases] of Object.entries(CBC_ALIASES)) {
    for (const alias of aliases) {
      const re = new RegExp(
        `(?:^[\\s:]|\\s)(${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s*[:=\\-]?\\s*([0-9]+(?:\\.[0-9]+)?)`,
        "im"
      );
      const m = normalized.match(re);
      if (m && m[2]) {
        out[canonical] = m[2];
        break;
      }
    }
  }
  return out;
}

export type OcrAssistResult = {
  status: "DRAFT" | "FAILED";
  draft: Record<string, string>;
  rawTextPreview: string;
  message: string;
};

export async function extractLabOcrDraft(
  data: Buffer,
  mimeType: string
): Promise<OcrAssistResult> {
  if (mimeType === "application/pdf") {
    try {
      let text = "";
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse");
        const parsed = await pdfParse(data);
        text = String(parsed?.text || "");
      } catch {
        return {
          status: "FAILED",
          draft: {},
          rawTextPreview: "",
          message:
            "PDF text extraction unavailable on this deployment. Enter results manually or install optional pdf-parse dependency.",
        };
      }
      const draft = extractCandidates(text);
      return {
        status: "DRAFT",
        draft,
        rawTextPreview: text.slice(0, 2000),
        message:
          Object.keys(draft).length > 0
            ? "OCR draft extracted from PDF text. Review and correct before verifying."
            : "No CBC-like values found in PDF text. Enter results manually.",
      };
    } catch (e) {
      return {
        status: "FAILED",
        draft: {},
        rawTextPreview: "",
        message: e instanceof Error ? e.message : "PDF OCR failed",
      };
    }
  }

  if (mimeType.startsWith("image/")) {
    return {
      status: "FAILED",
      draft: {},
      rawTextPreview: "",
      message:
        "Image OCR is not enabled on this zero-cost deployment (no paid Vision API). Enter structured results manually; original image is preserved for review.",
    };
  }

  return {
    status: "FAILED",
    draft: {},
    rawTextPreview: "",
    message: "Unsupported document type for OCR assist",
  };
}
