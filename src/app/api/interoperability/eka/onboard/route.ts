import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { onboardEkaFacility } from "@/lib/interoperability/eka-onboarding-adapter";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const clinicId = String(body?.clinicId || "");
    const hipId = String(body?.hipId || "");

    if (!clinicId || !hipId) {
      return NextResponse.json({ error: "clinicId and hipId are required." }, { status: 400 });
    }

    const membership = await prisma.clinicMember.findFirst({
      where: { clinicId, doctorId: session.doctorId },
      include: { clinic: true },
    });

    if (!membership || !["Owner", "Admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Only clinic owners or admins can onboard the facility." }, { status: 403 });
    }

    const name = String(body?.name || membership.clinic.name).trim();
    if (!name) return NextResponse.json({ error: "Facility name is required." }, { status: 400 });

    const result = await onboardEkaFacility({ hipId, name, clinicId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });

    return NextResponse.json({
      success: true,
      provider: result.provider,
      data: result.data ?? null,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to onboard the facility with Eka." }, { status: 502 });
  }
}
