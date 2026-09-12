# MedLum Step 8 — Provider-neutral interoperability expansion

## Goal
Keep MedLum's clinical core independent from any single vendor while creating stable capability-based integration points.

## Architecture

Clinical core -> interoperability gateway -> adapter -> external provider

The core selects capabilities such as FHIR, consent, ABHA, booking discovery, claims, blood availability and external labs. It does not depend on Eka, a particular lab, insurer or booking vendor.

## Current foundation
- Provider-neutral adapter descriptors in `src/lib/interoperability/adapters.ts`.
- Shared FHIR resource types and mappings in `src/lib/interoperability/fhir.ts`.
- Capability/operation gateway in `src/lib/interoperability/interop.ts`.
- Authenticated `/api/interoperability/capabilities` endpoint.
- No external credentials required for this foundation.
- No vendor SDK added.
- No database migration.
- No external network calls are made by the new gateway.

## Supported integration slots
- ABHA / ABDM
- Consent
- FHIR export
- UHI appointment discovery
- NHCX claims
- Blood-bank availability
- External laboratory orders/results

## Safety and cost constraints
The interoperability layer must remain free to run in the MedLum core. Vendor credentials, paid plans, API charges and licensing must be isolated inside optional adapters. The clinical core must continue working when an adapter is disabled or unavailable.

## Next integration work
After this foundation is verified, individual adapters can be activated one at a time. Eka/ABDM remains a provider option, not a hard dependency. Credentials and production external calls are deliberately deferred to Step 9.
