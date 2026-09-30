# MedLum private OCR (PaddleOCR)

Self-hosted OCR for Clinical Assist. Patient documents must not leave MedLum infrastructure.

## Deploy (Render or equivalent)

- Docker image built from this directory
- Env: `OCR_SERVICE_SECRET` (shared with Next.js `OCR_SERVICE_SECRET`)
- Resources: **minimum 2 GB RAM, 1 vCPU** for CPU inference; **4 GB recommended** for multi-page PDFs
- Health: `GET /health`
- OCR: `POST /v1/ocr` multipart (`file`, `requestId`, `clinicId`) + `Authorization: Bearer <secret>`

## App env

```
OCR_SERVICE_URL=https://<your-ocr-host>
OCR_SERVICE_SECRET=<shared-secret>
```

When `OCR_SERVICE_URL` is set, Clinical Assist uses this service instead of in-process Tesseract on Vercel.
