# MedLum PACS Integration — Architecture Decision Record

**Date:** 2026-10-12  
**Baseline main SHA:** `0d42888b720e2e3721902622c97a4b4a3e57c379`  
**Branch:** `feat/pacs-orthanc-ohif-v2`

## Selected architecture

| Component | Selection |
|-----------|-----------|
| PACS server | **Orthanc** (GPLv3+ core; independent deployable service) |
| Browser viewer | **OHIF** (MIT) |
| Clinical metadata | MedLum Postgres table `ImagingStudy` |
| DICOM objects | Orthanc storage only — **not** Vercel, **not** Postgres BLOBs |

Calling Orthanc via REST/DICOMweb from MedLum is an accepted licensing pattern. Do not embed Orthanc source into MedLum.

OHIF is not FDA-cleared; do not market as certified primary diagnostic workstation without separate regulatory work.

## Cost (₹0-first)

| Component | Software fee | Ops |
|-----------|--------------|-----|
| Orthanc / OHIF | ₹0 | Needs persistent VM + disk for production |
| MedLum metadata | ₹0 incremental | Existing Neon |
| Vercel | Unchanged | **Not** a PACS host |

A durable hospital PACS is **not** proven ₹0 indefinitely. Dev uses `services/pacs` Docker.

## Auth model

MedLum session + clinic membership + diagnostic RBAC before study list or viewer launch. Orthanc base URL only from server env (SSRF-safe). No public unauthenticated PACS proxy. Production PACS and OHIF endpoints must use HTTPS; plain HTTP endpoints are accepted only outside production. Do not put PACS credentials in browser URLs or OHIF configuration exposed to clients.

## Env (placeholders)

```
PACS_ENABLED=false
PACS_ORTHANC_BASE_URL=
PACS_ORTHANC_PUBLIC_URL=
PACS_DICOMWEB_ROOT=/dicom-web
PACS_OHIF_BASE_URL=
PACS_ORTHANC_USERNAME=
PACS_ORTHANC_PASSWORD=
```

## Limitations

- Production Orthanc host not provisioned by this PR.
- The Prisma `ImagingStudy` model is present; validate migration and schema against the target database before rollout.
- Metadata API submissions remain `PENDING`; only a trusted ingestion/verification flow may mark a study available. No such production ingestion flow is provisioned yet.
- CI now validates synthetic DICOM upload, DICOMweb QIDO/WADO-RS frame retrieval, and pixel integrity against an isolated Orthanc container. It does **not** yet prove OHIF browser rendering or production browser-to-PACS connectivity/CORS/authentication.
- Keep `PACS_ENABLED=false` until a trusted ingestion/verification flow, OHIF browser-render smoke test, production Orthanc host, persistent storage, HTTPS, authentication, backup/restore, and access controls are verified. Never use real patient data in synthetic CI.
