import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

async function getMembership() {
  const session = await getSession();
  if (!session) return { session: null, membership: null };
  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId: session.doctorId, isActive: true },
    select: { clinicId: true, role: true },
  });
  return { session, membership };
}

export async function GET(req: Request) {
  try {
    const { session, membership } = await getMembership();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!membership || !["Owner", "Admin", "Consultant"].includes(membership.role)) {
      return NextResponse.json({ error: "Not permitted" }, { status: 403 });
    }

    const patientId = new URL(req.url).searchParams.get("patientId") || "";
    if (!patientId) return NextResponse.json({ success: false, error: "Patient is required." }, { status: 400 });

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: membership.clinicId },
      select: { id: true, name: true, phone: true },
    });
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found." }, { status: 404 });

    const account = await prisma.patientPortalAccount.findUnique({
      where: { patientId: patient.id },
      select: { id: true, phone: true, status: true, lastLoginAt: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({
      success: true,
      patient,
      account: account ? {
        ...account,
        lastLoginAt: account.lastLoginAt?.toISOString() || null,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      } : null,
    });
  } catch (e) {
    console.error("portal account status", e);
    return NextResponse.json({ success: false, error: "Unable to load portal access." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
        { success: false, error: "Patient and a password of at least 8 characters are required." },
        { status: 400 }
      );
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: membership.clinicId },
      select: { id: true, phone: true },
    });
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found." }, { status: 404 });
    if (!patient.phone.trim()) {
      return NextResponse.json(
        { success: false, error: "Patient must have a phone number before portal access can be created." },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(password, 12);
    const existing = await prisma.patientPortalAccount.findUnique({ where: { patientId: patient.id } });
    if (existing) {
      await prisma.patientPortalAccount.update({
        where: { id: existing.id },
        data: { phone: patient.phone.trim(), passwordHash: hash, status: "Active" },
      });
      return NextResponse.json({ success: true, created: false });
    }

    await prisma.patientPortalAccount.create({
      data: {
        clinicId: membership.clinicId,
        patientId: patient.id,
        phone: patient.phone.trim(),
        passwordHash: hash,
        status: "Active",
      },
    });
    return NextResponse.json({ success: true, created: true });
  } catch (e) {
    console.error("portal account", e);
    return NextResponse.json({ success: false, error: "Unable to provision portal access." }, { status: 500 });
  }
}
