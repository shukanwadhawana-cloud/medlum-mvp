import type { AdapterResult, InteropProvider } from "./types";
import { ekaConfigured, ekaInitMobileRegistration } from "./eka";

export type AbhaMobileInitInput = {
  mobileNumber: string;
  partnerPtId: string;
};

export type AbhaMobileInitData = {
  txnId: string;
  hint?: string | null;
};

/**
 * Eka is an optional provider adapter. The clinical core must not call Eka
 * directly; all Eka-specific credentials and transport remain in this file
 * and eka.ts.
 */
export async function createAbhaMobileRegistration(
  input: AbhaMobileInitInput,
): Promise<AdapterResult<AbhaMobileInitData>> {
  const provider: InteropProvider = "EKA_ABDM";

  if (!ekaConfigured()) {
    return { ok: false, provider, error: "Eka ABDM adapter is not configured." };
  }

  try {
    const result = await ekaInitMobileRegistration({
      mobileNumber: input.mobileNumber,
      ptId: process.env.EKA_PT_ID!,
      partnerPtId: input.partnerPtId,
      hipId: process.env.EKA_HIP_ID!,
    });

    return { ok: true, provider, data: { txnId: result.txn_id, hint: result.hint } };
  } catch (error) {
    return {
      ok: false,
      provider,
      error: error instanceof Error ? error.message : "Eka ABDM request failed.",
    };
  }
}
