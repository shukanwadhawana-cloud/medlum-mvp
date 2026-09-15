import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { saveClinicSetup, getClinicSetup } from "@/lib/clinic-products";

async function context() {
  const session = await getSession();
  if (!session) return null;
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId: session.doctorId, isActive: true, clinic: { isActive: true } }, include: { clinic: true }, orderBy: { createdAt: "asc" } });
  return membership ? { session, membership } : null;
}

export async function GET() {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!["Owner", "Admin"].includes(ctx.membership.role)) return NextResponse.json({ success: false, error: "Only the clinic owner or admin can view setup details." }, { status: 403 });
  return NextResponse.json({ success: true, clinic: ctx.membership.clinic, setup: await getClinicSetup(ctx.membership.clinicId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!["Owner", "Admin"].includes(ctx.membership.role)) return NextResponse.json({ success: false, error: "Only the clinic owner or admin can update setup details." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const facilityType = body.facilityType === "HOSPITAL" ? "HOSPITAL" : "CLINIC";
  const subscriptionModel = body.subscriptionModel === "OPD" || body.subscriptionModel === "IPD" ? body.subscriptionModel : "BOTH";
  const values = { ...body, facilityType, subscriptionModel, onboardingCompleted: true };
  if (!String(values.ownerName || "").trim() || !String(values.doctorInCharge || "").trim() || !String(values.address || "").trim() || !String(values.city || "").trim() || !String(values.state || "").trim() || !String(values.pincode || "").trim()) return NextResponse.json({ success: false, error: "Owner, doctor in charge and complete address details are required." }, { status: 400 });
  if (facilityType === "HOSPITAL" && (!String(values.licenseNumber || "").trim() || !String(values.registrationNumber || "").trim())) return NextResponse.json({ success: false, error: "Hospital license and registration numbers are required." }, { status: 400 });
  const setup = await saveClinicSetup(ctx.membership.clinicId, values);
  return NextResponse.json({ success: true, setup });
}
