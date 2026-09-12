const EKA_BASE_URL = process.env.EKA_BASE_URL || "https://api.eka.care";

type EkaAuthResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
};

type EkaMobileInitResponse = { hint?: string | null; txn_id: string };
type EkaConsentCreateResponse = { consent_init_id?: string };
type EkaCareContextLinkResponse = Record<string, unknown>;
type EkaFacilityOnboardResponse = { hip_code?: string; hip_id?: string; hip_name?: string; scan_share_url?: string };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = { error: text || "Empty response" }; }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body
      ? String((body as { error?: unknown }).error)
      : `Eka API returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function ekaFetch<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const auth = await ekaClientLogin();
  const response = await fetch(`${EKA_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
      "X-Pt-Id": required("EKA_PT_ID"),
      "X-Partner-Pt-Id": headers?.["X-Partner-Pt-Id"] || "",
      "X-Hip-Id": required("EKA_HIP_ID"),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  return parseResponse<T>(response);
}

export async function ekaClientLogin(): Promise<EkaAuthResponse> {
  const response = await fetch(`${EKA_BASE_URL}/connect-auth/v1/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: required("EKA_API_KEY"),
      client_id: required("EKA_CLIENT_ID"),
      client_secret: required("EKA_CLIENT_SECRET"),
      user_token: process.env.EKA_USER_TOKEN || "",
    }),
    cache: "no-store",
  });
  return parseResponse<EkaAuthResponse>(response);
}

export async function ekaInitMobileRegistration(input: {
  mobileNumber: string;
  ptId: string;
  partnerPtId: string;
  hipId: string;
}): Promise<EkaMobileInitResponse> {
  const auth = await ekaClientLogin();
  const response = await fetch(`${EKA_BASE_URL}/abdm/na/v1/registration/mobile/init`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
      "X-Pt-Id": input.ptId,
      "X-Partner-Pt-Id": input.partnerPtId,
      "X-Hip-Id": input.hipId,
    },
    body: JSON.stringify({ mobile_number: input.mobileNumber }),
    cache: "no-store",
  });
  return parseResponse<EkaMobileInitResponse>(response);
}

export async function ekaCreateConsent(input: {
  appointmentId?: string;
  careContexts?: Array<{ cc_ref: string; patient_ref: string }>;
  hipIdentifier: { id: string; name: string };
  hiu: { clinicId: string; doctorOid: string; requester: { system: string; type: string; value: string; name: string } };
  patient: { healthId: string; oid: string };
  period: { expiry: string; from: string; to: string };
  purpose: "Self Requested" | "Care management" | "Public Health" | "Disease Specific Health Research";
  recordTypes: string[];
  partnerPtId: string;
}): Promise<EkaConsentCreateResponse> {
  return ekaFetch<EkaConsentCreateResponse>("/abdm/v1/consents/create", {
    appointment_id: input.appointmentId,
    care_contexts: input.careContexts || [],
    hip_identifier: input.hipIdentifier,
    hiu: {
      clinic_id: input.hiu.clinicId,
      d_oid: input.hiu.doctorOid,
      requester: {
        identifier: {
          system: input.hiu.requester.system,
          type: input.hiu.requester.type,
          value: input.hiu.requester.value,
        },
        name: input.hiu.requester.name,
      },
    },
    patient: input.patient,
    period: input.period,
    purpose: input.purpose,
    record_types: input.recordTypes,
  }, { "X-Partner-Pt-Id": input.partnerPtId });
}

export async function ekaLinkCareContext(input: {
  abhaAddress: string;
  careContexts: Array<{ careContextId: string; data?: string; display: string; hiTypes: string[] }>;
  oid: string;
  partnerUserId: string;
}): Promise<EkaCareContextLinkResponse> {
  return ekaFetch<EkaCareContextLinkResponse>("/abdm/v1/care-contexts/link", {
    abha_address: input.abhaAddress,
    care_contexts: input.careContexts.map((item) => ({
      care_context_id: item.careContextId,
      ...(item.data ? { data: item.data } : {}),
      display: item.display,
      hi_types: item.hiTypes,
    })),
    oid: input.oid,
    partner_user_id: input.partnerUserId,
  }, { "X-Partner-Pt-Id": input.partnerUserId });
}

export async function ekaOnboardFacility(input: {
  hipId: string;
  name: string;
  clinicId: string;
}): Promise<EkaFacilityOnboardResponse> {
  return ekaFetch<EkaFacilityOnboardResponse>("/abdm/v1/hip/onboard", {
    hip_id: input.hipId,
    name: input.name,
    clinic_id: input.clinicId,
  });
}

export function ekaConfigured(): boolean {
  return Boolean(process.env.EKA_CLIENT_ID && process.env.EKA_CLIENT_SECRET && process.env.EKA_API_KEY && process.env.EKA_PT_ID && process.env.EKA_HIP_ID);
}
