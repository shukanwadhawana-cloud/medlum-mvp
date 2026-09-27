# MedLum Help / Chatwoot

Phase 1 adds an optional Chatwoot communication boundary.

- MedLum remains the clinical source of truth.
- Chatwoot is used for support conversations only.
- Facility membership is checked by MedLum before a conversation is created.
- Patient context is only accepted when the patient belongs to the selected facility.
- Chatwoot credentials stay server-side.
- Existing OPD/IPD workflows do not depend on Chatwoot.

Required server environment variables:

CHATWOOT_BASE_URL
CHATWOOT_ACCOUNT_ID
CHATWOOT_INBOX_ID
CHATWOOT_API_ACCESS_TOKEN

Next: deploy Chatwoot, create the MedLum Help API inbox, configure Vercel, then verify end-to-end conversation creation before adding more UI integrations.
