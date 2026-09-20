# ABDM / EKA Integration (MedLum MVP)

## Architecture integration point

MedLum remains the clinical source of truth. EKA is an optional interoperability adapter under `src/lib/interoperability/`.

Flow: Hospital/Clinic → Patient → ABHA link → Consent → Care context → EKA exchange → Callback state updates

## Supported workflow

| Step | Status |
|------|--------|
| EKA client authentication | Implemented (server-side) |
| Facility HIP onboarding | Implemented; clinic-scoped `ekaHipId` persisted |
| ABHA mobile init | Implemented; patient `abhaStatus=PENDING` |
| ABHA confirm/link | Implemented; `LINKED` with number/address |
| Consent create | Implemented; status **REQUESTED** (not fake GRANTED) |
| Consent callback lifecycle | Implemented; GRANTED/DENIED via signed webhook |
| Care context share (encounter) | Implemented; `AbdmCareContext` row |
| HIU data-on-push callback | Signature-auth; no clinical decrypt/persist |
| Tenant isolation | Membership clinicId; no trusted client clinicId |
| Patient mobile UI | Patient chart ABHA section |

## Environment variables (names only)

`EKA_BASE_URL`, `EKA_API_KEY`, `EKA_CLIENT_ID`, `EKA_CLIENT_SECRET`, `EKA_USER_TOKEN`, `EKA_PT_ID`, `EKA_HIP_ID`, `EKA_WEBHOOK_SIGNING_KEY`

Clinic HIP stored on `Clinic.ekaHipId` after onboard; `resolveHipId` prefers clinic value.

## States

ABHA: NOT_LINKED → PENDING → LINKED | FAILED  
Consent: REQUESTED → PENDING → GRANTED | DENIED | FAILED  
Care context: PENDING → SUBMITTED → LINKED

## Security

- Secrets never returned from status API
- Webhooks HMAC verified; CSRF-exempt
- Browser routes require session + clinic membership
- Onboard limited to Owner/Admin

## Testing

```bash
node scripts/verify-eka-onboarding.mjs
```

## Limitations

Local/static verified. Not sandbox/production E2E verified without live EKA credentials, registered webhooks, and ABDM certification. Encrypted HIU decrypt not implemented.
