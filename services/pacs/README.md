# Local Orthanc (development only)

```bash
cd services/pacs && docker compose up -d
# http://localhost:8042 — change credentials before any network exposure
```

Never commit real patient DICOM. See docs/PACS_INTEGRATION.md.
