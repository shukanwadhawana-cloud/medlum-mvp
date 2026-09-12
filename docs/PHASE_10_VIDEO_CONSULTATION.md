# Phase 10 — Video Consultation

Phase 10 turns the Phase 9B telemedicine foundation into an actual browser video-consultation workflow.

## Workflow

1. Doctor creates a telemedicine session.
2. MedLum creates a per-session video room through the configured provider adapter.
3. Patient receives a tokenized waiting-room link.
4. Doctor opens the session and moves it from Scheduled → Waiting → Active.
5. Doctor and patient enter the video room.
6. Doctor completes the consultation and moves the session to Completed.

## Provider architecture

The application does not hard-code a video SDK into the clinical data model. `VIDEO_PROVIDER` selects the provider adapter:

- `jitsi` — automatic room creation using `VIDEO_BASE_URL` (default: `https://meet.jit.si`).
- `external` — keeps provider-neutral behavior and allows an externally supplied HTTPS meeting URL.

The room name contains a cryptographically random component. Patient join credentials remain token-based and the database stores only a SHA-256 hash of the join token.

## Routes

- `/telemedicine` — doctor session management.
- `/telemedicine/[id]` — authenticated doctor video room and lifecycle controls.
- `/telemedicine/join?token=...` — patient waiting room / video room.
- `/api/telemedicine/sessions` — authenticated doctor session creation/listing.
- `/api/telemedicine/sessions/[id]` — authenticated doctor lifecycle management.
- `/api/telemedicine/join?token=...` — token-gated patient session access.

## Important boundary

Phase 10 provides the video layer; it does not introduce video recording or clinical media storage. The Phase 9B session remains the clinical system-of-record anchor, while the video provider is replaceable.
