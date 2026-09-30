"""
MedLum private OCR service — PaddleOCR inference.
Never log document content or patient identifiers. Log requestId only.
"""
from __future__ import annotations

import io
import os
import uuid
from typing import Any

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

MAX_BYTES = int(os.environ.get("OCR_MAX_BYTES", str(10 * 1024 * 1024)))
MAX_PAGES = int(os.environ.get("OCR_MAX_PAGES", "20"))
SERVICE_SECRET = os.environ.get("OCR_SERVICE_SECRET", "").strip()

app = FastAPI(title="MedLum OCR", docs_url=None, redoc_url=None)
_ocr = None


def get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR

        _ocr = PaddleOCR(use_angle_cls=True, lang="en", use_gpu=False, show_log=False)
    return _ocr


def authorize(authorization: str | None):
    if not SERVICE_SECRET:
        raise HTTPException(status_code=503, detail="OCR service is not configured")
    if not authorization or authorization != f"Bearer {SERVICE_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def sniff_mime(data: bytes, filename: str, declared: str) -> str:
    name = (filename or "").lower()
    declared = (declared or "").lower()
    if data[:5] == b"%PDF-":
        return "application/pdf"
    if len(data) >= 3 and data[0] == 0xFF and data[1] == 0xD8 and data[2] == 0xFF:
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if declared in ("application/pdf", "image/jpeg", "image/png", "image/webp"):
        return declared
    if name.endswith(".pdf"):
        return "application/pdf"
    if name.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if name.endswith(".png"):
        return "image/png"
    return declared or "application/octet-stream"


def pdf_to_images(data: bytes) -> list[Any]:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    images = []
    count = min(len(pdf), MAX_PAGES)
    for i in range(count):
        page = pdf[i]
        bitmap = page.render(scale=2)
        pil = bitmap.to_pil()
        images.append(pil.convert("RGB"))
    return images


def ocr_pil(image) -> tuple[str, float | None]:
    import numpy as np

    ocr = get_ocr()
    arr = np.array(image)
    result = ocr.ocr(arr, cls=True)
    lines: list[str] = []
    confs: list[float] = []
    if not result:
        return "", None
    for block in result:
        if not block:
            continue
        for line in block:
            if not line or len(line) < 2:
                continue
            text_part = line[1]
            if isinstance(text_part, (list, tuple)) and len(text_part) >= 1:
                lines.append(str(text_part[0]))
                if len(text_part) >= 2:
                    try:
                        confs.append(float(text_part[1]))
                    except Exception:
                        pass
    text = "\n".join(lines).strip()
    conf = sum(confs) / len(confs) if confs else None
    return text, conf


@app.get("/health")
def health():
    return {"ok": True, "engine": "paddleocr"}


@app.post("/v1/ocr")
async def ocr_endpoint(
    file: UploadFile = File(...),
    requestId: str = Form(""),
    clinicId: str = Form(""),
    authorization: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    authorize(authorization)
    rid = (requestId or x_request_id or str(uuid.uuid4())).strip()
    data = await file.read()
    if not data:
        return JSONResponse(
            {
                "requestId": rid,
                "status": "FAILED",
                "pageCount": 0,
                "pages": [],
                "text": "",
                "errorCode": "EMPTY_FILE",
                "errorMessage": "Empty file.",
            },
            status_code=400,
        )
    if len(data) > MAX_BYTES:
        return JSONResponse(
            {
                "requestId": rid,
                "status": "FAILED",
                "pageCount": 0,
                "pages": [],
                "text": "",
                "errorCode": "FILE_TOO_LARGE",
                "errorMessage": "File exceeds size limit.",
            },
            status_code=413,
        )

    filename = file.filename or "document"
    mime = sniff_mime(data, filename, file.content_type or "")

    try:
        pages_out = []
        if mime == "application/pdf":
            images = pdf_to_images(data)
            if not images:
                return {
                    "requestId": rid,
                    "status": "FAILED",
                    "pageCount": 0,
                    "pages": [],
                    "text": "",
                    "errorCode": "PDF_NO_PAGES",
                    "errorMessage": "PDF has no readable pages.",
                }
            for i, img in enumerate(images):
                text, conf = ocr_pil(img)
                pages_out.append({"page": i + 1, "text": text, "confidence": conf})
        elif mime in ("image/jpeg", "image/png", "image/webp"):
            from PIL import Image

            img = Image.open(io.BytesIO(data)).convert("RGB")
            text, conf = ocr_pil(img)
            pages_out.append({"page": 1, "text": text, "confidence": conf})
        else:
            return JSONResponse(
                {
                    "requestId": rid,
                    "status": "UNSUPPORTED",
                    "pageCount": 0,
                    "pages": [],
                    "text": "",
                    "errorCode": "UNSUPPORTED_TYPE",
                    "errorMessage": "Unsupported document type.",
                },
                status_code=415,
            )
    except Exception:
        return JSONResponse(
            {
                "requestId": rid,
                "status": "FAILED",
                "pageCount": 0,
                "pages": [],
                "text": "",
                "errorCode": "OCR_ENGINE_ERROR",
                "errorMessage": "OCR processing failed.",
            },
            status_code=500,
        )

    combined = "\n\n".join(p["text"] for p in pages_out if p.get("text")).strip()
    confs = [p["confidence"] for p in pages_out if p.get("confidence") is not None]
    avg = sum(confs) / len(confs) if confs else None

    if not combined:
        status = "FAILED"
        error_code = "NO_TEXT"
        error_message = "No readable text detected."
    elif avg is not None and avg < 0.45:
        status = "LOW_CONFIDENCE"
        error_code = None
        error_message = None
    elif any(not p.get("text") for p in pages_out) and combined:
        status = "PARTIAL"
        error_code = None
        error_message = None
    else:
        status = "SUCCESS"
        error_code = None
        error_message = None

    return {
        "requestId": rid,
        "status": status,
        "pageCount": len(pages_out),
        "pages": pages_out,
        "text": combined,
        "errorCode": error_code,
        "errorMessage": error_message,
    }
