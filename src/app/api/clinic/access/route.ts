import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveClinicId, getClinicSetup } from "@/lib/clinic-products";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const clinicId = await getActiveClinicId(session.doctorId);
  if (!clinicId) return NextResponse.json({ success: false, error: "No active clinic" }, { status: 404 });
  const setup = await getClinicSetup(clinicId);
  return NextResponse.json({ success: true, clinicId, subscriptionModel: setup.subscriptionModel, facilityType: setup.facilityType, onboardingCompleted: setup.onboardingCompleted }, { headers: { "Cache-Control": "no-store" } });
}
