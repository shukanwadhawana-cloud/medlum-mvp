# MedLum private OCR (PaddleOCR)

Self-hosted OCR for Clinical Assist. Patient documents must not leave MedLum infrastructure.

## Deploy on Vercel (preferred)

- File: `Dockerfile.vercel` (listens on `$PORT`)
- Project: isolated `medlum-ocr` (do not replace the main Next.js app)
- Env: `OCR_SERVICE_SECRET` (shared with MedLum `OCR_SERVICE_SECRET`)
- Health: `GET /health`
- OCR: `POST /v1/ocr` multipart + `Authorization: Bearer <secret>`
- Resources: high memory (PaddleOCR models); allow long `maxDuration` (up to platform limit)

## Deploy on Render (alternative)

- Docker: `Dockerfile`
- Env: `OCR_SERVICE_SECRET`, `OCR_MAX_BYTES`, `OCR_MAX_PAGES`
- Health: `/health`

## MedLum app env

```
OCR_SERVICE_URL=https://<ocr-host>
OCR_SERVICE_SECRET=<shared-secret>
```

Clinical Assist uses this service only (no Tesseract fallback). Lab OCR remains independent.
