import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { canResetPortalPassword, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await consumeRateLimit(
    authBucketKey("portal-reset", req, session.doctorId),
    AUTH_LIMITS.portalReset.limit,
    AUTH_LIMITS.portalReset.windowMs
  );
  if (!rl.allowed) {
    const { body: b, headers } = rateLimitResponse(rl.retryAfterSec);
    return NextResponse.json(b, { status: 429, headers });
  }

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || !canResetPortalPassword(membership.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const patientId = String(body.patientId || "");
  const password = String(body.password || "");
  if (!patientId || password.length < 8) {
    return NextResponse.json(
      { error: "Patient and a password of at least 8 characters are required." },
      { status: 400 }
    );
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: membership.clinicId },
    select: { id: true },
  });
  const account = patient
    ? await prisma.patientPortalAccount.findUnique({ where: { patientId: patient.id } })
    : null;
  if (!patient || !account) {
    return NextResponse.json({ error: "Portal access is not available for this patient." }, { status: 404 });
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.patientPortalAccount.update({
    where: { id: account.id },
    data: { passwordHash: hash, status: "Active" },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "PORTAL_PASSWORD_RESET",
    entity: "PatientPortalAccount",
    entityId: account.id,
    meta: {
      clinicId: membership.clinicId,
      patientId: patient.id,
      actorRole: membership.role,
    },
  });

  return NextResponse.json({ success: true });
}
