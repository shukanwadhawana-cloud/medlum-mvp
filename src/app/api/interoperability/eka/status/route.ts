import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ekaConfigured } from "@/lib/interoperability/eka";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId: session.doctorId },
    select: { role: true, clinicId: true },
  });

  if (!membership || !["Owner", "Admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Only clinic owners or admins can view ABDM integration status." }, { status: 403 });
  }

  return NextResponse.json({
    provider: "EKA_ABDM",
    configured: ekaConfigured(),
    clinicId: membership.clinicId,
  }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
