# Local Orthanc PACS (development only)

Independent PACS stack for MedLum imaging development. **Do not** run this on Vercel.

## What this provides

- Orthanc DICOM server with DICOMweb plugin (typical `jodogne/orthanc-plugins` image)
- HTTP API on port 8042
- DICOM C-STORE on port 4242

## Quick start

```bash
cd services/pacs
docker compose up -d
# Orthanc Explorer: http://localhost:8042
# Default demo credentials are intentionally weak for local only — change before any network exposure.
```

Upload synthetic DICOM samples via Orthanc Explorer (Upload). Never use real patient studies in shared or public environments.

## Point MedLum at local Orthanc

In local `.env` (never commit):

```
PACS_ENABLED=true
PACS_ORTHANC_BASE_URL=http://127.0.0.1:8042
PACS_ORTHANC_PUBLIC_URL=http://127.0.0.1:8042
PACS_DICOMWEB_ROOT=/dicom-web
PACS_OHIF_BASE_URL=https://viewer.ohif.org  # or self-hosted OHIF
PACS_ORTHANC_USERNAME=orthanc
PACS_ORTHANC_PASSWORD=orthanc
```

For production, use TLS, strong credentials, private networking, backups, and an authorization strategy. See `docs/PACS_INTEGRATION.md`.

## Synthetic test data

Use public de-identified sample DICOM sets (e.g. from medical imaging research repositories). Do not commit DICOM binaries to GitHub.
