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

MedLum session + clinic membership + diagnostic RBAC before study list, verification, or viewer launch. Orthanc base URL only from server env (SSRF-safe). No public unauthenticated PACS proxy. Production PACS and OHIF endpoints must use HTTPS; plain HTTP endpoints are accepted only outside production. Do not put PACS credentials in browser URLs or OHIF configuration exposed to clients.

## Trusted verification

Browser metadata registration always creates/updates rows as `PENDING` and never sets `orthancId`.

`POST /api/imaging-studies/verify` (authenticated, clinic-scoped):

1. Loads the MedLum `ImagingStudy` for the caller’s clinic.
2. Calls Orthanc server-to-server (`/tools/find` + `/studies/{id}`) with optional basic auth from env.
3. Requires returned `StudyInstanceUID` to match the MedLum record (`UID_MISMATCH` otherwise).
4. Only then sets `orthancId` and `status = AVAILABLE`.
5. Audits `verify_attempt`, `verify_failed`, and successful `verify`.

Viewer launch (`?launch=1`) is rejected with `STUDY_NOT_READY` unless status is `AVAILABLE` and `orthancId` is set.

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

- Production Orthanc/OHIF host is **not** provisioned by this application deploy.
- CI validates synthetic DICOM upload, DICOMweb QIDO/WADO-RS frame retrieval, and pixel integrity against an isolated Orthanc container. It does **not** yet prove OHIF browser canvas rendering or production CORS/auth.
- Keep `PACS_ENABLED=false` in production until Orthanc is hosted with HTTPS, persistent storage, backups, edge access control, and a successful synthetic OHIF browser smoke test.
- Never use real patient DICOM in CI or shared test environments.
