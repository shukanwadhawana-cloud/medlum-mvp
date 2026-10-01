# MedLum private OCR — PaddleOCR (self-hosted). CPU-first.
# Do not publish this service publicly without auth + network isolation.
# Build pin: 73f2c9d1d6ac7ab0ac0888bab507a720a6aa754f
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OCR_MAX_BYTES=8388608 \
    OCR_MAX_PAGES=12 \
    OCR_MAX_IMAGE_EDGE=1600 \
    OCR_PDF_RENDER_SCALE=1.5

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
