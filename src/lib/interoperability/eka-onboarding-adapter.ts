import { ekaOnboardFacility } from "./eka";
import type { AdapterResult } from "./types";

type EkaFacilityOnboardResult = {
  hip_code?: string;
  hip_id?: string;
  hip_name?: string;
  scan_share_url?: string;
};

export async function onboardEkaFacility(input: {
  hipId: string;
  name: string;
  clinicId: string;
}): Promise<AdapterResult<EkaFacilityOnboardResult>> {
  try {
    const data = await ekaOnboardFacility(input);
    return { ok: true, provider: "EKA_ABDM", data };
  } catch (error) {
    return {
      ok: false,
      provider: "EKA_ABDM",
      error: error instanceof Error ? error.message : "Eka facility onboarding failed",
    };
  }
}
