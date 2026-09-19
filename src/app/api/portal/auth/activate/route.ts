import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setPortalSession } from "@/lib/portal-session";
import { verifyPortalActivationToken } from "@/lib/portal-activation";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (!token || password.length < 8) return NextResponse.json({ error: "Activation link and password of at least 8 characters are required." }, { status: 400 });

  const payload = verifyPortalActivationToken(token);
  if (!payload) return NextResponse.json({ error: "This activation link is invalid or has expired. Ask your clinic for a new link." }, { status: 400 });

  const account = await prisma.patientPortalAccount.findFirst({
    where: { patientId: payload.patientId, clinicId: payload.clinicId },
    select: { id: true, patientId: true, status: true },
  });
  if (!account) return NextResponse.json({ error: "Portal access is no longer available. Ask your clinic for a new link." }, { status: 404 });

  const hash = await bcrypt.hash(password, 12);
  await prisma.patientPortalAccount.update({
    where: { id: account.id },
    data: { passwordHash: hash, status: "Active" },
  });
  await setPortalSession(account.patientId, account.id);
  return NextResponse.json({ success: true });
}
