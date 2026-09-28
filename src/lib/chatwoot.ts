type ChatwootConfig = {
  baseUrl: string;
  accountId: string;
  inboxId: number;
  apiAccessToken: string;
};

function getConfig(): ChatwootConfig | null {
  const baseUrl = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, "");
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  const inboxId = Number(process.env.CHATWOOT_INBOX_ID);
  const apiAccessToken = process.env.CHATWOOT_API_ACCESS_TOKEN;

  if (!baseUrl || !accountId || !Number.isInteger(inboxId) || inboxId <= 0 || !apiAccessToken) {
    return null;
  }

  return { baseUrl, accountId, inboxId, apiAccessToken };
}

async function chatwootFetch(path: string, init?: RequestInit) {
  const config = getConfig();
  if (!config) throw new Error("Chatwoot integration is not configured.");

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("api_access_token", config.apiAccessToken);

  const response = await fetch(config.baseUrl + path, {
    ...init,
    headers,
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : `Chatwoot request failed (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

export function isChatwootConfigured() {
  return Boolean(getConfig());
}

export async function createMedlumHelpConversation(input: {
  name: string;
  email?: string;
  phone?: string;
  identifier: string;
  message: string;
  category: string;
  clinicId: string;
  clinicName: string;
  role: string;
  staffCode?: string;
  patientId?: string;
  patientUhid?: string;
}) {
  const config = getConfig();
  if (!config) throw new Error("Chatwoot integration is not configured.");

  const accountPath = `/api/v1/accounts/${encodeURIComponent(config.accountId)}`;

  const search = await chatwootFetch(
    `${accountPath}/contacts/search?q=${encodeURIComponent(input.identifier)}`
  );
  const existing = Array.isArray(search?.payload)
    ? search.payload.find((contact: any) => contact?.identifier === input.identifier)
    : null;

  const contact = existing ?? await chatwootFetch(`${accountPath}/contacts`, {
    method: "POST",
    body: JSON.stringify({
      inbox_id: config.inboxId,
      name: input.name,
      email: input.email || undefined,
      phone_number: input.phone || undefined,
      identifier: input.identifier,
      additional_attributes: {
        medlum_clinic_id: input.clinicId,
        medlum_clinic_name: input.clinicName,
        medlum_role: input.role,
        medlum_staff_code: input.staffCode || "",
      },
    }),
  });

  const conversation = await chatwootFetch(`${accountPath}/conversations`, {
    method: "POST",
    body: JSON.stringify({
      source_id: input.identifier,
      inbox_id: config.inboxId,
      contact_id: contact.id,
      status: "open",
      additional_attributes: {
        medlum_clinic_id: input.clinicId,
        medlum_clinic_name: input.clinicName,
        medlum_category: input.category,
        medlum_patient_id: input.patientId || "",
        medlum_patient_uhid: input.patientUhid || "",
      },
      message: { content: input.message },
    }),
  });

  return {
    id: conversation?.id,
    displayId: conversation?.display_id,
    uuid: conversation?.uuid,
  };
}
