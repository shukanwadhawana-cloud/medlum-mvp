import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import {
  createFacilityTelegramConnection,
  ensureFacilityTelegramWebhook,
  sendFacilityTelegramMessage,
} from "@/lib/facility-telegram";

export const runtime = "nodejs";

/** Facility Owner / Admin only — clinicId always from server membership. */
async function requireFacilityTelegramAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 }) };

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) {
    return { error: NextResponse.json({ success: false, error: "No active facility membership." }, { status: 403 }) };
  }
  if (membership.role !== "Owner" && membership.role !== "Admin") {
    return { error: NextResponse.json({ success: false, error: "Facility Telegram is restricted to Owner and Admin." }, { status: 403 }) };
  }
  return { membership };
}

function publicStatus(row: {
  status: string;
  enabled: boolean;
  botUsername: string;
  chatId: string;
  lastVerifiedAt: Date | null;
  connectionExpiresAt: Date | null;
} | null) {
  if (!row) {
    return {
      connected: false,
      status: "NOT_CONNECTED",
      label: "Not connected",
      botUsername: null as string | null,
      hasChat: false,
      lastVerifiedAt: null as string | null,
      connectionExpiresAt: null as string | null,
      configured: false,
    };
  }
  const status = String(row.status || "PENDING").toUpperCase();
  let label = status;
  if (status === "CONNECTED") label = "Connected";
  else if (status === "PENDING") label = "Connection pending";
  else if (status === "ERROR") label = "Error / disconnected";
  else if (status === "DISABLED") label = "Disabled";
  return {
    connected: status === "CONNECTED" && row.enabled && Boolean(row.chatId),
    status,
    label,
    botUsername: row.botUsername || null,
    hasChat: Boolean(row.chatId),
    lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
    connectionExpiresAt: row.connectionExpiresAt ? row.connectionExpiresAt.toISOString() : null,
    configured: true,
  };
}

export async function GET() {
  const auth = await requireFacilityTelegramAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { membership } = auth as { membership: { clinicId: string } };

  const row = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId: membership.clinicId },
    select: {
      status: true,
      enabled: true,
      botUsername: true,
      chatId: true,
      lastVerifiedAt: true,
      connectionExpiresAt: true,
    },
  });

  return NextResponse.json({ success: true, clinicId: membership.clinicId, telegram: publicStatus(row) });
}

export async function POST(req: Request) {
  const auth = await requireFacilityTelegramAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { membership } = auth as { membership: { clinicId: string } };
  const clinicId = membership.clinicId;

  const body = await req.json().catch(() => ({}));
  const action = body.action === "test" ? "test" : "connect";

  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId },
    select: { clinicId: true, enabled: true, status: true },
  });

  if (!integration?.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Facility Telegram is not configured for this clinic. A bot token must be set when the facility is created or by platform administration.",
      },
      { status: 404 }
    );
  }

  if (action === "test") {
    const facility = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
    const result = await sendFacilityTelegramMessage(
      clinicId,
      `MedLum test notification\n\nFacility: ${facility?.name || clinicId}\n\nFacility Telegram routing is working.`
    );
    if (!result.sent) {
      return NextResponse.json({ success: false, error: result.reason || "Telegram delivery failed." }, { status: 503 });
    }
    return NextResponse.json({ success: true, message: "Test notification sent." });
  }

  try {
    await ensureFacilityTelegramWebhook(clinicId);
    const connection = await createFacilityTelegramConnection(clinicId);
    return NextResponse.json({ success: true, ...connection });
  } catch (error) {
    console.error("[MedLum Facility Telegram] facility connect failed", {
      clinicId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { success: false, error: "Could not prepare the Telegram connection. Check facility Telegram configuration." },
      { status: 500 }
    );
  }
}
