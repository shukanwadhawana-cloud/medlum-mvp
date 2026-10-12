# Free-cloud PACS deployment gate

**Status: not deployed. Synthetic-only deployment remains blocked pending a safe same-origin access design.**

This repository already has an isolated Orthanc synthetic E2E workflow. That workflow proves the Orthanc/DICOMweb data path in CI; it does not prove a public deployment, OHIF rendering, or secure browser access.

## Why we do not expose a free Orthanc service directly

A public Orthanc endpoint must not expose unauthenticated administrative REST or DICOM ports. Putting Orthanc credentials into a static OHIF configuration or browser URL is not acceptable. A free Render web service also does not provide durable storage by default; its local filesystem must be treated as ephemeral unless persistent disk support is explicitly provisioned and verified.

## Deployment prerequisites

- A same-origin authenticated gateway that protects both the OHIF app and DICOMweb requests without embedding upstream PACS credentials in client-side assets.
- Orthanc administrative API reachable only from the internal service network or gateway.
- TLS on the public gateway and correct CORS/auth behavior for mobile Safari.
- Explicit synthetic-only warning and no production MedLum database credentials.
- Synthetic DICOM upload, QIDO-RS/WADO-RS retrieval, and OHIF browser rendering test on iPhone.
- Confirmed ₹0 plan and no paid resources created.
- Keep production `PACS_ENABLED=false`; do not add PACS endpoints to production Vercel variables as part of this demo.

## Stop condition

Do not publish an unauthenticated Orthanc endpoint just to make a demo URL available. If the selected free host cannot provide the gateway and storage properties above, leave the demo undeployed and retain the existing isolated CI test. This is safer than an apparently working but exposed PACS endpoint.
