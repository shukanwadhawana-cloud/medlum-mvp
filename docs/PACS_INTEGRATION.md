# MedLum PACS Integration — Architecture Decision Record

**Date:** 2026-10-12  
**Baseline main SHA:** `0d42888b720e2e3721902622c97a4b4a3e57c379`  
**Status:** MedLum application integration implemented; external PACS host is optional and separate.

## Selected architecture

| Component | Selection | Version guidance |
|-----------|-----------|------------------|
| PACS server | **Orthanc** | Current stable series (1.12+/1.13+); run as independent service |
| Browser viewer | **OHIF** | MIT-licensed OHIF Viewer 3.x against Orthanc DICOMweb |
| Clinical metadata | MedLum PostgreSQL (Prisma `ImagingStudy`) | Canonical patient/order/tenant links |
| DICOM objects | Orthanc storage (filesystem or Orthanc-supported backend) | **Not** Vercel, **not** Postgres BLOBs |

### Required Orthanc plugins (typical)

- **DICOMweb** — QIDO-RS / WADO-RS / STOW-RS for OHIF
- Optional: Authorization plugin for token validation against MedLum
- Optional: PostgreSQL index backend for larger archives (AGPL implications — see licensing)

### Rejected for first slice

- **Dicoogle** — useful for indexing/search research; heavier ops surface for small clinic pilot
- **dcm4chee** — full enterprise archive; higher operational cost and complexity for zero-cost-first pilot
- Running PACS on **Vercel** — no durable local disk; not a DICOM store

## Licensing (software fees = ₹0)

| Software | Licence | Commercial use |
|----------|---------|----------------|
| Orthanc core | GPLv3+ | Free to run as service; calling via REST/DICOM from MedLum is accepted |
| Orthanc DICOMweb / some plugins | Often AGPLv3+ | Running plugins as installed services is accepted; do not redistribute derived AGPL code under proprietary terms without compliance |
| OHIF Viewer | MIT | Free for commercial use |
| MedLum integration code | Project proprietary (see PROPRIETARY.md) | Does not embed Orthanc source |

**Important:** Dual licensing for Orthanc is no longer available for UCLouvain-owned code. Using Orthanc *as a service* (not forking/redistributing GPL/AGPL code into MedLum) is the intended model.

OHIF is **not** FDA-cleared / CE-marked as a diagnostic device. Do not market MedLum+OHIF as a certified primary diagnostic workstation without separate regulatory work.

## Storage and networking

```
Modalities / import → Orthanc (DICOM C-STORE or STOW-RS)
                         ↓
                   Orthanc storage (disk / supported backend)
                         ↓ DICOMweb (QIDO/WADO)
MedLum (Vercel) ←→ metadata APIs ←→ ImagingStudy in Neon Postgres
Clinician browser → MedLum Diagnostics → authorized viewer launch → OHIF → Orthanc DICOMweb
```

- MedLum remains source of truth for patients, clinics, diagnostic orders, reports.
- Orthanc holds pixels and DICOM instances.
- Viewer launch is server-authorized; browser never receives Orthanc admin credentials.

## Cost assessment (₹0-first)

| Component | Software fee | Infrastructure |
|-----------|--------------|----------------|
| Orthanc | ₹0 | Needs persistent VM/container + disk |
| OHIF | ₹0 | Static host or same VM; or Orthanc OHIF plugin |
| MedLum metadata | ₹0 incremental | Existing Neon/Postgres |
| Object storage (R2) | Not assumed as Orthanc backend without verified adapter | Optional later |
| Vercel | Unchanged | **Not** used as PACS |
| TLS / domain | Prefer existing | Incremental if new subdomain |
| Backups | Ops process | Disk snapshots / Orthanc export |

**Honest limit:** A secure, continuously available hospital PACS is **not** proven ₹0 indefinitely. Free tiers (Hobby VMs) often lack adequate disk, backups, and private networking. Development uses local Docker (`services/pacs`). Production requires a dedicated host you control.

## Authentication model

1. Clinician authenticates to MedLum (existing session cookie).
2. Study list / metadata require active clinic membership + diagnostic RBAC (`canEnterDiagnosticReport`).
3. Viewer launch endpoint checks tenant scope on `ImagingStudy` before returning OHIF URL + study UID.
4. Orthanc must not be publicly writable. Prefer private network + auth plugin or reverse-proxy auth.
5. No unauthenticated proxy from MedLum to arbitrary PACS URLs (SSRF prevention: fixed base URL from env only).

## Environment variables (placeholders only)

```
PACS_ENABLED=false
PACS_ORTHANC_BASE_URL=
PACS_ORTHANC_PUBLIC_URL=
PACS_DICOMWEB_ROOT=/dicom-web
PACS_OHIF_BASE_URL=
PACS_ORTHANC_USERNAME=
PACS_ORTHANC_PASSWORD=
```

Never commit real credentials. Server-side only for Orthanc username/password.

## Known limitations (this PR)

- Does not provision a production Orthanc host.
- Does not implement modality worklist, HL7, FHIR, or AI interpretation.
- Real DICOM retrieval requires a running Orthanc with studies; CI validates contracts without patient data.
- Full E2E image load requires local/dev Orthanc + synthetic DICOM.

## Rollback

1. Set `PACS_ENABLED=false` (UI shows unavailable; APIs return configured=false).
2. Revert migration only after confirming no production dependency on `ImagingStudy` rows.
3. MedLum diagnostic orders remain functional without PACS.
