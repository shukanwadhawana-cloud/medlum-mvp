/**
 * Server-side OCR assist for Clinical Assist.
 * Documents are processed in memory and returned only as editable draft text.
 * No clinical record is created or finalized by this helper.
 *
 * Vercel notes: tesseract.js must not use a custom workerPath (breaks on serverless).
 * Prefer text-layer PDFs; image OCR uses tesseract with /tmp cache.
 */
export type ClinicalOcrResult = {
  text: string;
  confidence: number | null;
  method: "pdf-text" | "pdf-ocr" | "image-ocr";
  pageLimitReached?: boolean;
};

async function preprocessForOcr(data: Buffer): Promise<Buffer> {
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(data);
    const maxW = 1800;
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
      const v = Math.max(0, Math.min(255, (gray - 16) * 1.3));
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
  // Do NOT set workerPath — custom paths break on Vercel serverless.
  // Lang data caches under /tmp (writable on Vercel).
  const worker = await createWorker("eng", 1, {
    cachePath: "/tmp/medlum-tessdata",
    cacheMethod: "write",
  });
  try {
    const prepared = await preprocessForOcr(data);

    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    } as Record<string, string>);

    let result = await worker.recognize(prepared);
    let text = String(result?.data?.text || "").trim();
    let confidence = typeof result?.data?.confidence === "number" ? result.data.confidence : 0;

    if (text.length < 12 || confidence < 35) {
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

    if (text.length < 8) {
      result = await worker.recognize(data);
      text = String(result?.data?.text || "").trim();
      confidence = typeof result?.data?.confidence === "number" ? result.data.confidence : 0;
    }

    return { text, confidence };
  } finally {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
  }
}

async function extractPdf(data: Buffer): Promise<ClinicalOcrResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
  const textParts: string[] = [];
  const maxPagesForOcr = Math.min(document.numPages, 2);

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      textParts.push(content.items.map((item: { str?: string }) => item.str || "").join(" "));
      page.cleanup();
    }

    const textLayer = textParts.join("\n").replace(/\s+/g, " ").trim();
    // Prefer embedded text — no OCR needed (reliable on Vercel).
    if (textLayer.length >= 20) {
      return { text: textParts.join("\n").trim(), confidence: null, method: "pdf-text" };
    }

    // Scanned PDF: rasterize first pages and OCR
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
      const viewport = page.getViewport({ scale: 1.6 });
      const canvasFactory = new NodeCanvasFactory();
      const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
      await page
        .render({
          canvasContext: canvasAndContext.context as never,
          viewport,
          canvasFactory,
        } as never)
        .promise;
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
    try {
      await document.destroy();
    } catch {
      /* ignore */
    }
  }
}

export async function extractClinicalOcrText(data: Buffer, mimeType: string): Promise<ClinicalOcrResult> {
  const mime = String(mimeType || "").toLowerCase().trim();
  if (mime === "application/pdf") return extractPdf(data);
  if (mime.startsWith("image/") || mime === "image/jpg") {
    if (mime === "image/heic" || mime === "image/heif") {
      throw new Error("Unsupported document type: HEIC/HEIF");
    }
    const result = await ocrImage(data);
    return { text: result.text, confidence: result.confidence, method: "image-ocr" };
  }
  // Sniff if mime missing
  if (!mime && data.length > 8) {
    const sig = data.subarray(0, 4).toString("hex");
    if (sig.startsWith("25504446")) return extractPdf(data);
    if (sig.startsWith("ffd8") || sig.startsWith("89504e47") || sig.startsWith("52494646")) {
      const result = await ocrImage(data);
      return { text: result.text, confidence: result.confidence, method: "image-ocr" };
    }
  }
  throw new Error("Unsupported document type. Upload a PDF or image.");
}
