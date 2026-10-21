import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, error: "Sign in to continue." }, { status: 401 });
    const selected = await requireActiveClinicMembership(session.doctorId);
    if (!selected) return NextResponse.json({ success: false, error: "An active clinic membership is required." }, { status: 403 });
    const actor = await prisma.clinicMember.findUnique({
      where: { id: selected.membershipId },
      select: { id: true, clinicId: true, doctorId: true, role: true },
    });
    if (!actor || !["Owner", "Admin"].includes(actor.role)) {
      return NextResponse.json({ success: false, error: "Only the clinic owner or an admin can issue a staff reset link." }, { status: 403 });
    }

    const { id: targetMembershipId } = await context.params;
    const target = await prisma.clinicMember.findFirst({
      where: { id: targetMembershipId, clinicId: actor.clinicId, isActive: true },
      select: { id: true, doctorId: true, role: true, staffCode: true, doctor: { select: { id: true, name: true, isActive: true } } },
    });
    if (!target || !target.doctor.isActive) return NextResponse.json({ success: false, error: "Active staff account not found in this clinic." }, { status: 404 });
    if (target.doctorId === actor.doctorId || target.role === "Owner" || (target.role === "Admin" && actor.role !== "Owner")) {
      return NextResponse.json({ success: false, error: "You are not permitted to issue a reset link for this account." }, { status: 403 });
    }

    const now = new Date();
    const token = randomBytes(32).toString("base64url");
    const codeHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    await prisma.otpChallenge.updateMany({
      where: { doctorId: target.doctorId, purpose: "password_reset_link", consumedAt: null },
      data: { consumedAt: now },
    });
    await prisma.otpChallenge.create({
      data: {
        doctorId: target.doctorId,
        clinicId: actor.clinicId,
        purpose: "password_reset_link",
        codeHash,
        expiresAt,
        maxAttempts: 1,
        deliveryChannel: "admin_link",
      },
    });
    await writeAudit({
      doctorId: actor.doctorId,
      action: "STAFF_PASSWORD_RESET_LINK_ISSUED",
      entity: "Doctor",
      entityId: target.doctorId,
      clinicId: actor.clinicId,
      meta: { membershipId: target.id, staffCode: target.staffCode, expiresInMinutes: 30 },
    });
    return NextResponse.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      staffName: target.doctor.name,
      staffCode: target.staffCode,
    }, { headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
  } catch (error) {
    console.error("staff password reset link failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ success: false, error: "Could not issue reset link. Please try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
