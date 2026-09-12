const EKA_BASE_URL = process.env.EKA_BASE_URL || "https://api.eka.care";

type EkaAuthResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
};

type EkaMobileInitResponse = {
  hint?: string | null;
  txn_id: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text || "Empty response" };
  }

  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body
      ? String((body as { error?: unknown }).error)
      : `Eka API returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return body as T;
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

export function ekaConfigured(): boolean {
  return Boolean(
    process.env.EKA_CLIENT_ID &&
    process.env.EKA_CLIENT_SECRET &&
    process.env.EKA_API_KEY &&
    process.env.EKA_PT_ID &&
    process.env.EKA_HIP_ID,
  );
}
