import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { createFacilityTelegramConnection, ensureFacilityTelegramWebhook, getFacilityTelegramWebhookDiagnostics } from "@/lib/facility-telegram";

export const runtime = "nodejs";

async function owner() {
  const session = await getSession();
  if (!session) return null;
  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
    select: { id: true, email: true },
  });
  if (!doctor || !isMedlumOwnerEmail(doctor.email)) return null;
  return doctor;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId } = await params;
  const user = await owner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });

  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId },
    select: { botUsername: true, chatId: true, enabled: true, status: true, lastVerifiedAt: true, connectionExpiresAt: true },
  });

  const configured = Boolean(integration?.enabled);
  const connected = Boolean(configured && integration?.chatId && integration.status === "CONNECTED");
  return NextResponse.json({
    success: true,
    configured,
    connected,
    botUsername: integration?.botUsername || null,
    status: configured ? integration?.status || "PENDING" : "NOT_CONFIGURED",
    lastVerifiedAt: integration?.lastVerifiedAt?.toISOString() || null,
    connectionExpiresAt: integration?.connectionExpiresAt?.toISOString() || null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId } = await params;
  const user = await owner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });

  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId },
    select: { clinicId: true, enabled: true },
  });
  if (!integration?.enabled) {
    return NextResponse.json({ success: false, error: "Facility Telegram is not configured." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.action === "repair-webhook") {
    try {
      await ensureFacilityTelegramWebhook(clinicId);
      const diagnostics = await getFacilityTelegramWebhookDiagnostics(clinicId);
      return NextResponse.json({
        success: true,
        message: diagnostics.webhookUrlMatches
          ? "Telegram webhook is registered at the correct MedLum facility endpoint."
          : "Telegram webhook URL still does not match the expected endpoint.",
        diagnostics,
      });
    } catch (error) {
      console.error("[MedLum Facility Telegram] webhook repair/diagnostics failed", {
        clinicId,
        reason: error instanceof Error ? error.message : "unknown",
      });
      const reason = error instanceof Error ? error.message : "unknown";
      const errorMessage = reason === "TELEGRAM_WEBHOOK_SECRET_MISSING"
        ? "Telegram webhook security is not configured on the server. Configure TELEGRAM_WEBHOOK_SECRET and redeploy."
        : reason === "TELEGRAM_WEBHOOK_SECRET_INVALID_FORMAT"
          ? "TELEGRAM_WEBHOOK_SECRET contains characters Telegram does not allow. Use only letters, numbers, underscores, or hyphens."
          : reason === "FACILITY_TELEGRAM_NOT_CONFIGURED"
            ? "This facility has no enabled Telegram bot configuration."
            : /unauthorized|invalid token/i.test(reason)
              ? "Telegram rejected this facility's bot token. Restore a valid BotFather token."
              : "Telegram webhook repair failed. Review the webhook diagnostic error in production logs.";
      return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
  }

  try {
    await ensureFacilityTelegramWebhook(clinicId);
    const connection = await createFacilityTelegramConnection(clinicId);
    return NextResponse.json({ success: true, ...connection });
  } catch (error) {
    console.error("[MedLum Facility Telegram] connection setup failed", {
      clinicId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    const reason = error instanceof Error ? error.message : "unknown";
    const publicError = reason === "TELEGRAM_WEBHOOK_SECRET_MISSING"
      ? "Telegram webhook security is not configured on the server. Configure TELEGRAM_WEBHOOK_SECRET and redeploy."
      : reason === "TELEGRAM_WEBHOOK_SECRET_INVALID_FORMAT"
        ? "TELEGRAM_WEBHOOK_SECRET contains characters Telegram does not allow. Use only letters, numbers, underscores, or hyphens."
        : reason === "FACILITY_TELEGRAM_NOT_CONFIGURED"
          ? "This facility has no Telegram bot configured. The existing facility's bot configuration must be restored."
          : /unauthorized|invalid token/i.test(reason)
            ? "Telegram rejected the bot token. Re-enter a valid token from BotFather for this facility."
            : reason === "TELEGRAM_WEBHOOK_URL_MISMATCH" || /webhook|url/i.test(reason)
              ? "Telegram did not confirm the expected webhook URL. Confirm MEDLUM_APP_URL points to https://medlumhealth.com and use Diagnose / repair webhook."
              : "Could not prepare the Telegram connection. Check the facility bot token and server configuration, then retry.";
    return NextResponse.json({ success: false, error: publicError }, { status: 500 });
  }
}
