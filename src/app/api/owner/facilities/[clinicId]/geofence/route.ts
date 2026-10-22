import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { getClinicSetup } from "@/lib/clinic-products";
import { geocodeFacilityAddress } from "@/lib/facility-geocoding";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

async function masterOwner() {
  const session = await getSession();
  if (!session) return null;
  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
    select: { id: true, email: true },
  });
  if (!doctor || !isMedlumOwnerEmail(doctor.email)) return null;
  return { id: doctor.id, email: doctor.email };
}

export async function GET(_req: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const user = await masterOwner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });
  const { clinicId } = await params;
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, address: true, dutyEnabled: true, dutyLat: true, dutyLng: true, dutyRadiusMeters: true },
  });
  if (!clinic) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });
  return NextResponse.json({
    success: true,
    clinicId,
    name: clinic.name,
    dutyEnabled: clinic.dutyEnabled,
    hasCoordinates: clinic.dutyLat != null && clinic.dutyLng != null,
    dutyLat: clinic.dutyLat,
    dutyLng: clinic.dutyLng,
    dutyRadiusMeters: clinic.dutyRadiusMeters,
    address: clinic.address,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(_req: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const user = await masterOwner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });
  const { clinicId } = await params;
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, address: true, dutyEnabled: true, dutyLat: true, dutyLng: true, dutyRadiusMeters: true },
  });
  if (!clinic) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });
  if (clinic.dutyEnabled && clinic.dutyLat != null && clinic.dutyLng != null) {
    return NextResponse.json({
      success: true,
      status: "ALREADY_ACTIVE",
      dutyEnabled: true,
      dutyLat: clinic.dutyLat,
      dutyLng: clinic.dutyLng,
      dutyRadiusMeters: clinic.dutyRadiusMeters,
      message: "This facility's geofence is already active; its verified location was not changed.",
    });
  }

  try {
    const setup = await getClinicSetup(clinicId);
    const result = await geocodeFacilityAddress({
      name: clinic.name,
      address: clinic.address || setup.address,
      city: setup.city,
      state: setup.state,
      pincode: setup.pincode,
    });
    if (!result) {
      return NextResponse.json({
        success: false,
        status: "ADDRESS_NOT_RESOLVED",
        error: "The saved address could not be located precisely enough. An Owner/Admin must open Duty while physically at this hospital and use “Use my GPS” before saving the geofence.",
      }, { status: 422 });
    }

    const updated = await prisma.clinic.update({
      where: { id: clinicId },
      data: {
        dutyLat: result.lat,
        dutyLng: result.lng,
        dutyRadiusMeters: clinic.dutyRadiusMeters || 200,
        dutyEnabled: false,
      },
      select: { dutyLat: true, dutyLng: true, dutyRadiusMeters: true, dutyEnabled: true },
    });
    await writeAudit({
      doctorId: user.id,
      action: "DUTY_GEOFENCE_ADDRESS_GEOCODED",
      entity: "Clinic",
      entityId: clinicId,
      clinicId,
      meta: {
        source: "OPENSTREETMAP_NOMINATIM",
        confidence: result.confidence,
        matchType: result.matchType,
        dutyLat: result.lat,
        dutyLng: result.lng,
        dutyEnabled: false,
      },
    });
    return NextResponse.json({
      success: true,
      status: result.confidence === "high" ? "ADDRESS_LOCATED_REQUIRES_ON_SITE_VERIFICATION" : "ADDRESS_MATCH_NEEDS_REVIEW",
      label: result.label,
      confidence: result.confidence,
      ...updated,
      message: result.confidence === "high"
        ? "Address coordinates saved for this hospital. Have an Owner/Admin verify the location on-site before enabling attendance geofencing."
        : "A possible address match was saved as a disabled candidate. Verify it on-site; use GPS to replace it if it is not the hospital campus.",
    });
  } catch (error) {
    console.error("[MedLum geofence] owner address lookup failed", {
      clinicId,
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return NextResponse.json({
      success: false,
      status: "ADDRESS_LOOKUP_FAILED",
      error: "Could not look up this facility address right now. Retry later or use an Owner/Admin device GPS while physically at the hospital.",
    }, { status: 502 });
  }
}
