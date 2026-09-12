import type { AdapterResult, InteropProvider } from "./types";
import { ekaConfigured, ekaCreateConsent } from "./eka";

const provider: InteropProvider = "EKA_ABDM";

export type EkaConsentInput = Parameters<typeof ekaCreateConsent>[0];

export async function createEkaConsent(input: EkaConsentInput): Promise<AdapterResult<{ consentInitId?: string }>> {
  if (!ekaConfigured()) return { ok: false, provider, error: "Eka ABDM adapter is not configured." };
  try {
    const result = await ekaCreateConsent(input);
    return { ok: true, provider, data: { consentInitId: result.consent_init_id } };
  } catch (error) {
    return { ok: false, provider, error: error instanceof Error ? error.message : "Eka consent request failed." };
  }
}
