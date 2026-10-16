# Free cloud PACS demo: safe deployment boundary

This profile is for a disposable **synthetic-data demonstration only**. It is not a production PACS and must not be used for patient-identifiable data.

## What ₹0 can and cannot guarantee

Orthanc and OHIF are open-source. A cloud provider's free application tier does not imply durable storage, backups, continuous availability, or a stable public endpoint. Do not enable MedLum production PACS against a free-tier service unless its storage persistence, access controls, TLS, and backup/restore behavior have been verified.

## Non-negotiable boundaries

- Keep `PACS_ENABLED=false` in MedLum production until the production readiness checklist in `docs/PACS_INTEGRATION.md` is satisfied.
- Never connect this demo to a production MedLum database or a real patient workflow.
- Use only synthetic DICOM studies generated for testing.
- Do not expose Orthanc's administrative REST API or DICOM port directly to the public internet.
- Require authentication at the viewer and PACS edge; HTTPS is mandatory for any public endpoint.
- Do not put Orthanc credentials or access tokens in browser URLs, public configuration, Git, or client-side environment variables.
- Do not assume a free-tier filesystem survives restarts, redeploys, suspension, or service replacement.
- If a host cannot provide persistent storage and backup/restore, accept that all demo studies may be lost and do not upload anything important.

## Recommended staged rollout

1. Deploy Orthanc as an isolated service with authenticated access and DICOMweb enabled.
2. Attach persistent storage if the selected host supports it on the free plan. If not, label the environment disposable and synthetic-only.
3. Deploy OHIF separately and configure its DICOMweb endpoint without embedding credentials in static browser config.
4. Verify TLS, CORS, authentication, and that Orthanc's management endpoints are not publicly accessible.
5. Run the synthetic DICOM upload, QIDO-RS/WADO-RS frame retrieval, and browser-rendering smoke tests from a real mobile browser.
6. Keep MedLum production PACS disabled until the full production checklist passes. Test the MedLum-to-PACS integration in a non-production environment first.

## Stop conditions

Stop the rollout and leave MedLum production unchanged if any of the following are true:

- The host's persistence behavior is unknown or ephemeral.
- The public PACS endpoint has no effective authentication.
- The OHIF viewer cannot load a synthetic study over HTTPS.
- A clinic-scoped MedLum authorization check can be bypassed.
- The service requires paid capacity or a payment method the owner has not approved.
- Any existing MedLum CI check fails.

## Free-tier reality

If no free host available to this account supports persistent disk, backups, and the required access controls, the safe outcome is a working isolated synthetic demo or a deployment-ready configuration—not a claim of a production-ready PACS. Do not weaken MedLum's architecture to make the demo appear live.
