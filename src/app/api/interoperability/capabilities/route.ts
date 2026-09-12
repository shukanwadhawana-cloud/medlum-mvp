import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { INTEROP_ADAPTERS } from "@/lib/interoperability/adapters";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    adapters: INTEROP_ADAPTERS,
    operations: {
      export_fhir: "FHIR resource/bundle export",
      request_consent: "Provider-neutral consent request",
      create_abha: "ABHA creation/linking adapter slot",
      discover_appointments: "Booking discovery adapter slot",
      submit_claim: "Claims adapter slot",
      discover_blood: "Blood availability adapter slot",
      send_lab_order: "External lab order adapter slot",
      receive_lab_result: "External lab result adapter slot",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
