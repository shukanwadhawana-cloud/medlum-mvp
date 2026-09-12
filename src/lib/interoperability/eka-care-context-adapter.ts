import type { AdapterResult, InteropProvider } from "./types";
import { ekaConfigured, ekaLinkCareContext } from "./eka";

const provider: InteropProvider = "EKA_ABDM";
export type EkaCareContextInput = Parameters<typeof ekaLinkCareContext>[0];

export async function linkEkaCareContexts(input: EkaCareContextInput): Promise<AdapterResult<Record<string, unknown>>> {
  if (!ekaConfigured()) return { ok: false, provider, error: "Eka ABDM adapter is not configured." };
  try {
    const result = await ekaLinkCareContext(input);
    return { ok: true, provider, data: result };
  } catch (error) {
    return { ok: false, provider, error: error instanceof Error ? error.message : "Eka care-context link failed." };
  }
}
