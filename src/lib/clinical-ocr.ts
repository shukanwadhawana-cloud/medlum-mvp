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

/** Light preprocess: grayscale + modest contrast boost via canvas (no extra deps). */
async function preprocessForOcr(data: Buffer): Promise<Buffer> {
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(data);
    const maxW = 2000;
    const scale = img.width > maxW ? maxW / img.width : 1;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      // mild contrast stretch
      const v = Math.max(0, Math.min(255, (gray - 20) * 1.25));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toBuffer("image/png");
  } catch {
    return data;
  }
}

async function ocrImage(data: Buffer): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const workerPath = "./node_modules/tesseract.js/src/worker-script/node/index.js";
  const prepared = await preprocessForOcr(data);
  const worker = await createWorker("eng", 1, {
    workerPath,
    cachePath: "/tmp/medlum-tessdata",
    cacheMethod: "write",
  });
  try {
    // PSM 6 = assume a single uniform block of text (discharge summaries / forms)
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    } as Record<string, string>);
    let result = await worker.recognize(prepared);
    let text = String(result?.data?.text || "").trim();
    let confidence = typeof result?.data?.confidence === "number" ? result.data.confidence : 0;

    // Retry with auto page segmentation if the first pass is weak
    if (text.length < 12 || confidence < 40) {
      await worker.setParameters({
        tessedit_pageseg_mode: "3",
        preserve_interword_spaces: "1",
      } as Record<string, string>);
      result = await worker.recognize(prepared);
      const alt = String(result?.data?.text || "").trim();
      const altConf = typeof result?.data?.confidence === "number" ? result.data.confidence : 0;
      if (alt.length > text.length || altConf > confidence) {
        text = alt;
        confidence = altConf;
      }
    }

    // Last resort: raw bytes without preprocess
    if (text.length < 8) {
      result = await worker.recognize(data);
      text = String(result?.data?.text || "").trim();
      confidence = typeof result?.data?.confidence === "number" ? result.data.confidence : 0;
    }

    return { text, confidence };
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
      const viewport = page.getViewport({ scale: 2 });
      const canvasFactory = new NodeCanvasFactory();
      const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
      await page.render({
        canvasContext: canvasAndContext.context as unknown as CanvasRenderingContext2D,
        viewport,
        canvasFactory,
      } as never).promise;
      const png = canvasAndContext.canvas.toBuffer("image/png");
      const ocr = await ocrImage(png);
      if (ocr.text) ocrParts.push(ocr.text);
      confidences.push(ocr.confidence);
      canvasFactory.destroy(canvasAndContext);
      page.cleanup();
    }

    const text = ocrParts.join("\n\n").trim();
    const confidence =
      confidences.length > 0
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : 0;
    return {
      text,
      confidence,
      method: "pdf-ocr",
      pageLimitReached: document.numPages > maxPagesForOcr,
    };
  } finally {
    await document.destroy();
  }
}

export async function extractClinicalOcrText(bytes: Buffer, mime: string): Promise<ClinicalOcrResult> {
  if (mime === "application/pdf") {
    return extractPdf(bytes);
  }
  if (mime.startsWith("image/")) {
    if (mime === "image/heic" || mime === "image/heif") {
      throw new Error("Unsupported document type: HEIC/HEIF");
    }
    const ocr = await ocrImage(bytes);
    return { text: ocr.text, confidence: ocr.confidence, method: "image-ocr" };
  }
  throw new Error("Unsupported document type");
}
