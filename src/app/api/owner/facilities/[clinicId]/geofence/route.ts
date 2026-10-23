import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { getClinicSetup } from "@/lib/clinic-products";
import { geocodeFacilityAddress } from "@/lib/facility-geocoding";
import { writeAudit } from "@/lib/audit";
import { evaluateGeofenceFix, validateGpsAccuracy } from "@/lib/duty";

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

export async function POST(req: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const user = await masterOwner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });
  const { clinicId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "geocode");
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, address: true, dutyEnabled: true, dutyLat: true, dutyLng: true, dutyRadiusMeters: true },
  });
  if (!clinic) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });

  if (action === "activate-address") {
    if (clinic.dutyLat == null || clinic.dutyLng == null) {
      return NextResponse.json({ success: false, error: "Locate the saved facility address first, or use GPS while physically at the hospital." }, { status: 409 });
    }
    const currentLat = Number(body.currentLat);
    const currentLng = Number(body.currentLng);
    const accuracyMeters = body.accuracyMeters != null ? Number(body.accuracyMeters) : null;
    const accuracyCheck = validateGpsAccuracy(accuracyMeters);
    if (!accuracyCheck.ok) {
      return NextResponse.json({ success: false, error: accuracyCheck.error }, { status: 400 });
    }
    const check = evaluateGeofenceFix(
      { enabled: true, lat: clinic.dutyLat, lng: clinic.dutyLng, radiusMeters: 300 },
      currentLat,
      currentLng,
      accuracyMeters,
    );
    if (!check.ok) return NextResponse.json({ success: false, error: check.error || "You must be within 300 m of this hospital to verify its address coordinates.", distanceMeters: check.distanceMeters }, { status: 403 });
    const radius = Math.max(100, Math.min(300, Math.round(Number(body.radiusMeters) || clinic.dutyRadiusMeters || 200)));
    const updated = await prisma.clinic.update({
      where: { id: clinicId },
      data: { dutyEnabled: true, dutyRadiusMeters: radius },
      select: { dutyEnabled: true, dutyLat: true, dutyLng: true, dutyRadiusMeters: true },
    });
    await writeAudit({ doctorId: user.id, action: "DUTY_GEOFENCE_ENABLED", entity: "Clinic", entityId: clinicId, clinicId, meta: { source: "ADDRESS_VERIFIED_ON_SITE", ...updated, currentLat, currentLng, checkedDistanceMeters: check.distanceMeters } });
    return NextResponse.json({ success: true, status: "ACTIVE", ...updated, message: "Address coordinates verified on-site. Attendance geofencing is now active for this hospital." });
  }

  if (action === "activate-gps") {
    const currentLat = Number(body.currentLat);
    const currentLng = Number(body.currentLng);
    const accuracyMeters = body.accuracyMeters != null ? Number(body.accuracyMeters) : null;
    if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng) || currentLat < -90 || currentLat > 90 || currentLng < -180 || currentLng > 180) {
      return NextResponse.json({ success: false, error: "A valid device GPS fix is required. Allow location access and retry while at the hospital." }, { status: 400 });
    }
    const accuracyCheck = validateGpsAccuracy(accuracyMeters);
    if (!accuracyCheck.ok) {
      return NextResponse.json({ success: false, error: accuracyCheck.error }, { status: 400 });
    }
    const radius = Math.max(100, Math.min(300, Math.round(Number(body.radiusMeters) || clinic.dutyRadiusMeters || 200)));
    const updated = await prisma.clinic.update({
      where: { id: clinicId },
      data: { dutyEnabled: true, dutyLat: currentLat, dutyLng: currentLng, dutyRadiusMeters: radius },
      select: { dutyEnabled: true, dutyLat: true, dutyLng: true, dutyRadiusMeters: true },
    });
    await writeAudit({ doctorId: user.id, action: "DUTY_GEOFENCE_ENABLED", entity: "Clinic", entityId: clinicId, clinicId, meta: { source: "GPS_ON_SITE", ...updated } });
    return NextResponse.json({ success: true, status: "ACTIVE", ...updated, message: "Geofence anchored to your current GPS location. Attendance geofencing is now active for this hospital." });
  }

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
        error: "The saved address could not be located precisely enough. Use “Use current GPS & activate” while physically at this hospital to set its own attendance boundary.",
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
        ? "Address coordinates saved for this hospital. Verify them on-site before enabling attendance geofencing."
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
      error: "Could not look up this facility address right now. Retry later or use GPS while physically at the hospital.",
    }, { status: 502 });
  }
}
