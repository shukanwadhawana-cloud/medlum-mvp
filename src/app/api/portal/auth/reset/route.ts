import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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

  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId: session.doctorId, isActive: true },
    select: { clinicId: true, role: true },
  });
  if (!membership || !["Owner", "Admin", "Consultant"].includes(membership.role)) {
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
    select: { id: true, phone: true },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const account = await prisma.patientPortalAccount.findUnique({ where: { patientId: patient.id } });
  if (!account) {
    return NextResponse.json({ error: "Portal access has not been enabled for this patient." }, { status: 404 });
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.patientPortalAccount.update({
    where: { id: account.id },
    data: { passwordHash: hash, status: "Active" },
  });
  return NextResponse.json({ success: true });
}
