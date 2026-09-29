/**
 * Server-side OCR assist for Clinical Assist.
 * Documents are processed in memory and returned only as editable draft text.
 * No clinical record is created or finalized by this helper.
 */
export type ClinicalOcrResult = {
  text: string;
  confidence: number | null;
  method: "pdf-text" | "pdf-ocr" | "image-ocr";
  pageLimitReached?: boolean;
};

async function ocrImage(data: Buffer): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const workerPath = "./node_modules/tesseract.js/src/worker-script/node/index.js";
  const worker = await createWorker("eng", 1, {
    workerPath,
    cachePath: "/tmp/medlum-tessdata",
    cacheMethod: "write",
  });
  try {
    const result = await worker.recognize(data);
    return {
      text: String(result?.data?.text || "").trim(),
      confidence: typeof result?.data?.confidence === "number" ? result.data.confidence : 0,
    };
  } finally {
    await worker.terminate();
  }
}

async function extractPdf(data: Buffer): Promise<ClinicalOcrResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const textParts: string[] = [];
  const maxPagesForOcr = Math.min(document.numPages, 3);

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      textParts.push(content.items.map((item) => ("str" in item ? item.str : "") || "").join(" "));
      page.cleanup();
    }

    const textLayer = textParts.join("\n").trim();
    if (textLayer.length >= 20) {
      return { text: textLayer, confidence: null, method: "pdf-text" };
    }

    const { createCanvas } = await import("@napi-rs/canvas");
    class NodeCanvasFactory {
      create(width: number, height: number) {
        const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
        return { canvas, context: canvas.getContext("2d") };
      }
      reset(cc: { canvas: { width: number; height: number } }, width: number, height: number) {
        cc.canvas.width = Math.ceil(width);
        cc.canvas.height = Math.ceil(height);
      }
      destroy(cc: { canvas: { width: number; height: number } }) {
        cc.canvas.width = 0;
        cc.canvas.height = 0;
      }
    }

    const ocrParts: string[] = [];
    const confidences: number[] = [];
    for (let pageNumber = 1; pageNumber <= maxPagesForOcr; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const factory = new NodeCanvasFactory();
      const { canvas, context } = factory.create(viewport.width, viewport.height);
      await page.render({ canvasContext: context as any, viewport, canvasFactory: factory } as any).promise;
      const pageResult = await ocrImage(canvas.toBuffer("image/png"));
      if (pageResult.text) ocrParts.push(pageResult.text);
      if (pageResult.confidence > 0) confidences.push(pageResult.confidence);
      factory.destroy({ canvas });
      page.cleanup();
    }

    const combined = [textLayer, ...ocrParts].filter(Boolean).join("\n").trim();
    return {
      text: combined,
      confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
      method: "pdf-ocr",
      pageLimitReached: document.numPages > maxPagesForOcr,
    };
  } finally {
    await document.destroy();
  }
}

export async function extractClinicalOcrText(data: Buffer, mimeType: string): Promise<ClinicalOcrResult> {
  const mime = String(mimeType || "").toLowerCase().trim();
  if (mime === "application/pdf") return extractPdf(data);
  if (mime.startsWith("image/") || mime === "image/jpg") {
    const result = await ocrImage(data);
    return { ...result, method: "image-ocr" };
  }
  if (!mime && data.length > 8) {
    const sig = data.subarray(0, 4).toString("hex");
    if (sig.startsWith("25504446")) return extractPdf(data);
    if (sig.startsWith("ffd8") || sig.startsWith("89504e47") || sig.startsWith("52494646")) {
      const result = await ocrImage(data);
      return { ...result, method: "image-ocr" };
    }
  }
  throw new Error("Unsupported document type. Upload a PDF or image.");
}
