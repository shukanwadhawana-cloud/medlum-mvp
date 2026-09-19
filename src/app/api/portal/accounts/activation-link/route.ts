import { NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canResetPortalPassword, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { createPortalActivationToken } from "@/lib/portal-activation";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || !canResetPortalPassword(membership.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patientId = String(body.patientId || "");
  if (!patientId) return NextResponse.json({ error: "Patient is required." }, { status: 400 });

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: membership.clinicId },
    select: { id: true, phone: true },
  });
  if (!patient || !patient.phone?.trim()) {
    return NextResponse.json({ error: "Patient must have a registered phone number." }, { status: 400 });
  }

  const unusableHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
  const account = await prisma.patientPortalAccount.upsert({
    where: { patientId: patient.id },
    create: {
      id: crypto.randomUUID(),
      clinicId: membership.clinicId,
      patientId: patient.id,
      phone: patient.phone.trim(),
      passwordHash: unusableHash,
      status: "PendingActivation",
    },
    update: {
      phone: patient.phone.trim(),
      status: "PendingActivation",
      passwordHash: unusableHash,
    },
    select: { id: true },
  });

  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const token = createPortalActivationToken({ patientId: patient.id, clinicId: membership.clinicId, expiresAt });
  const origin = new URL(req.url).origin;
  return NextResponse.json({ success: true, activationUrl: origin + "/portal/activate?token=" + encodeURIComponent(token), expiresAt, accountId: account.id });
}
