import "server-only";

type ChatwootConfig = {
  baseUrl: string;
  apiToken: string;
  accountId: string;
};

export type MedLumConversationContext = {
  clinicId: string;
  clinicName?: string;
  patientId?: string;
  uhid?: string;
  encounterId?: string;
  ipdAdmissionId?: string;
  source?: "STAFF_HELP" | "PATIENT_COMMUNICATION";
  role?: string;
  staffId?: string;
};

function getConfig(): ChatwootConfig | null {
  const baseUrl = process.env.CHATWOOT_BASE_URL?.trim();
  const apiToken = process.env.CHATWOOT_API_TOKEN?.trim();
  const accountId = process.env.CHATWOOT_ACCOUNT_ID?.trim();

  if (!baseUrl || !apiToken || !accountId) return null;

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiToken,
    accountId,
  };
}

export function isChatwootConfigured() {
  return getConfig() !== null;
}

async function chatwootFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const config = getConfig();
  if (!config) {
    throw new Error("Chatwoot integration is not configured");
  }

  const response = await fetch(
    `${config.baseUrl}/api/v1/accounts/${config.accountId}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        api_access_token: config.apiToken,
        ...(init?.headers || {}),
      },
      cache: "no-store",
    },
  );

  const body = await response.text();
  let parsed: unknown = {};
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    parsed = { raw: body };
  }

  if (!response.ok) {
    throw new Error(
      `Chatwoot API ${response.status}: ${typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed)}`,
    );
  }

  return parsed as T;
}

/**
 * Keep MedLum as the source of truth. Chatwoot receives only communication
 * context/identifiers needed for routing and linking; clinical records remain
 * in MedLum/PostgreSQL.
 */
export function buildMedLumConversationAttributes(
  context: MedLumConversationContext,
) {
  return {
    medlum_clinic_id: context.clinicId,
    ...(context.clinicName ? { medlum_clinic_name: context.clinicName } : {}),
    ...(context.patientId ? { medlum_patient_id: context.patientId } : {}),
    ...(context.uhid ? { medlum_uhid: context.uhid } : {}),
    ...(context.encounterId
      ? { medlum_encounter_id: context.encounterId }
      : {}),
    ...(context.ipdAdmissionId
      ? { medlum_ipd_admission_id: context.ipdAdmissionId }
      : {}),
    ...(context.source ? { medlum_source: context.source } : {}),
    ...(context.role ? { medlum_role: context.role } : {}),
    ...(context.staffId ? { medlum_staff_id: context.staffId } : {}),
  };
}

export async function chatwootListInboxes() {
  return chatwootFetch<{ payload?: unknown[] }>("/inboxes");
}

export async function chatwootCreateConversation(input: {
  inboxId: number;
  contactId?: number;
  content: string;
  context: MedLumConversationContext;
}) {
  return chatwootFetch<unknown>("/conversations", {
    method: "POST",
    body: JSON.stringify({
      inbox_id: input.inboxId,
      contact_id: input.contactId,
      content: input.content,
      custom_attributes: buildMedLumConversationAttributes(input.context),
    }),
  });
}

export async function chatwootUpdateConversationAttributes(
  conversationId: number,
  context: MedLumConversationContext,
) {
  return chatwootFetch<unknown>(`/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      custom_attributes: buildMedLumConversationAttributes(context),
    }),
  });
}
