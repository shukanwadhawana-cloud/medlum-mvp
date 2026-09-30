# MedLum private OCR — PaddleOCR (self-hosted). CPU-first.
# Do not publish this service publicly without auth + network isolation.
FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV OCR_HOST=0.0.0.0
ENV OCR_PORT=8080
ENV OCR_MAX_BYTES=10485760
ENV OCR_MAX_PAGES=20

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
