/**
 * Zero-cost OCR assist for lab reports.
 * Input bytes are processed in memory only. OCR output is ALWAYS a DRAFT.
 * Human verification is required before anything becomes clinical truth.
 */

import { createRequire } from "node:module";
import { extractClinicalOcrText } from "@/lib/clinical-ocr";
import { extractCandidates } from "@/lib/lab-ocr-candidates";
export { extractCandidates };

const nodeRequire = createRequire(import.meta.url);

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
  try {
    let text = "";
    const warnings: string[] = [];
    if (mimeType === "application/pdf") {
      const pdf = await extractPdf(data);
      text = [pdf.text, pdf.scannedOcrText].filter(Boolean).join("\n");
      if (pdf.pagesOcr > 0) {
        warnings.push(
          "PDF had no usable text-layer values; OCR fallback scanned up to " +
            pdf.pagesOcr +
            " page(s)."
        );
      }
    } else if (mimeType.startsWith("image/")) {
      text = await ocrImage(data);
    } else {
      return {
        status: "FAILED",
        draft: {},
        rawTextPreview: "",
        message: "Unsupported document type for OCR assist",
      };
    }
    let draft = extractCandidates(text);
    // If the first pass cannot map values, reuse the stronger Clinical Assist OCR
    // pipeline: contrast preprocessing, alternate Tesseract segmentation, and
    // PDF text-layer/scanned-page fallback. This remains a draft, never a result.
    if (Object.keys(draft).length === 0) {
      try {
        const enhanced = await extractClinicalOcrText(data, mimeType);
        const enhancedText = String(enhanced.text || "").trim();
        const enhancedDraft = extractCandidates(enhancedText);
        if (enhancedText.length > text.length) text = enhancedText;
        if (Object.keys(enhancedDraft).length > Object.keys(draft).length) {
          draft = enhancedDraft;
        }
        warnings.push("Enhanced OCR fallback used " + enhanced.method + (enhanced.confidence == null ? "" : " (confidence " + Math.round(enhanced.confidence) + "%)") + ".");
        if (enhanced.pageLimitReached) warnings.push("Only the supported first pages of this PDF were OCR processed.");
      } catch (fallbackError) {
        warnings.push("Enhanced OCR fallback did not complete: " + (fallbackError instanceof Error ? fallbackError.message : "unknown OCR error"));
      }
    }
    if (Object.keys(draft).length === 0) {
      return {
        status: "FAILED",
        draft: {},
        rawTextPreview: text.slice(0, 4000),
        message:
          text.trim().length >= 20
            ? "Text was extracted, but no supported lab values could be mapped. Review the retained OCR text and enter/correct the result manually."
            : "OCR could not read enough text from this report. Try a clearer, upright image or a PDF; you can also enter the result manually.",
        warnings,
      };
    }
    return {
      status: "DRAFT",
      draft,
      rawTextPreview: text.slice(0, 4000),
      message:
        "OCR draft extracted. Review and correct before verifying the clinical result.",
      warnings,
    };
  } catch (error) {
    return {
      status: "FAILED",
      draft: {},
      rawTextPreview: "",
      message:
        error instanceof Error
          ? "OCR processing failed: " + error.message
          : "OCR processing failed",
      warnings: [
        "The report binary was processed in memory only; no third-party OCR API was used.",
      ],
    };
  }
}
