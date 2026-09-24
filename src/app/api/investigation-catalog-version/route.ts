import { NextResponse } from "next/server";
import { EXPANDED_LAB_CATALOG, EXPANDED_RADIOLOGY_CATALOG } from "@/lib/diagnostic-catalog";

export async function GET() {
  return NextResponse.json({
    catalog: "expanded-specialty-v2",
    laboratoryCount: EXPANDED_LAB_CATALOG.length,
    radiologyCount: EXPANDED_RADIOLOGY_CATALOG.length,
  });
}
