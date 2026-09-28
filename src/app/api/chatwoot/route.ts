import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import {
  chatwootCreateContact,
  chatwootCreateConversation,
  chatwootGetConversation,
  chatwootListInboxes,
  chatwootListMessages,
  chatwootSendMessage,
  isChatwootConfigured,
} from "@/lib/chatwoot";
import { medLumHelpAnswer, MEDLUM_HELP_KNOWLEDGE_VERSION } from "@/lib/medlum-help";

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function resolveContext() {
  const session = await getSession();
  if (!session) return { session: null, membership: null, doctor: null };

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return { session, membership: null, doctor: null };

  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
    select: { id: true, name: true, email: true },
  });
  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: { name: true },
  });

  return {
    session,
    membership,
    doctor: doctor ? { ...doctor, clinicName: clinic?.name || "" } : null,
  };
}

async function resolveInboxId() {
  const configured = Number(process.env.CHATWOOT_INBOX_ID);
  if (Number.isInteger(configured) && configured > 0) return configured;

  const result = await chatwootListInboxes();
  const inbox =
    (result.payload || []).find((item) => item.channel_type === "Channel::Api") ||
    (result.payload || [])[0];
  return inbox?.id || null;
}

export async function GET(req: Request) {
  try {
    if (!isChatwootConfigured()) return NextResponse.json({ success: true, configured: true, mode: "knowledge", knowledgeVersion: MEDLUM_HELP_KNOWLEDGE_VERSION });

    const url = new URL(req.url);
    const conversationId = Number(url.searchParams.get("conversationId") || "");
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return NextResponse.json({ success: true, configured: true });
    }

    const { membership, session } = await resolveContext();
    if (!session || !membership) return fail("Unauthorized", 401);
    const conversation = await chatwootGetConversation(conversationId);
    const attrs = conversation.custom_attributes || {};
    if (
      attrs.medlum_clinic_id !== membership.clinicId ||
      attrs.medlum_staff_id !== membership.membershipId
    ) {
      return fail("Conversation is not authorized for this staff member.", 403);
    }
    const result = await chatwootListMessages(conversationId);
    return NextResponse.json({
      success: true,
      configured: true,
      messages: result.payload || result,
    });
  } catch (error) {
    console.error("chatwoot GET error", error);
    return fail("Chat service is temporarily unavailable.", 502);
  }
}

export async function POST(req: Request) {
  try {
    const chatwootConfigured = isChatwootConfigured();

    const { session, membership, doctor } = await resolveContext();
    if (!session || !membership || !doctor) return fail("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action === "message" ? "message" : "start";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content || content.length > 4000) return fail("Message must contain 1–4000 characters.");

    if (!chatwootConfigured) {
      return NextResponse.json({ success: true, mode: "knowledge", message: { id: Date.now(), content: medLumHelpAnswer(content), message_type: "outgoing", sender: { name: "MedLum Help" } } });
    }

    const context = {
      clinicId: membership.clinicId,
      clinicName: doctor.clinicName,
      source: "STAFF_HELP" as const,
      role: membership.role,
      staffId: membership.membershipId,
    };

    if (action === "message") {
      const conversationId = Number(body.conversationId);
      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        return fail("Conversation is required.");
      }
      const conversation = await chatwootGetConversation(conversationId);
      const attrs = conversation.custom_attributes || {};
      if (
        attrs.medlum_clinic_id !== membership.clinicId ||
        attrs.medlum_staff_id !== membership.membershipId
      ) {
        return fail("Conversation is not authorized for this staff member.", 403);
      }
      const result = await chatwootSendMessage(conversationId, content);
      return NextResponse.json({ success: true, message: result });
    }

    const inboxId = await resolveInboxId();
    if (!inboxId) return fail("No Chatwoot API inbox is configured.", 503);

    const identifier = `medlum:${membership.clinicId}:${session.doctorId}`;
    const contact = await chatwootCreateContact({
      inboxId,
      name: doctor.name,
      email: doctor.email,
      identifier,
      context,
    });

    const contactId = Number(contact.id);
    if (!Number.isInteger(contactId) || contactId <= 0) {
      return fail("Chat service did not return a contact.", 502);
    }

    const conversation = await chatwootCreateConversation({
      inboxId,
      contactId,
      content,
      context,
    });

    return NextResponse.json({
      success: true,
      conversationId: Number(conversation.id),
      messages: conversation.messages || [],
    });
  } catch (error) {
    console.error("chatwoot POST error", error);
    return fail("Chat service is temporarily unavailable.", 502);
  }
}
