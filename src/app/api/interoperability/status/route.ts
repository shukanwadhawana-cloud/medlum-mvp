import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { INTEROP_ADAPTERS } from "@/lib/interoperability/adapters";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    version: "v1",
    core: "MedLum EMR",
    adapters: INTEROP_ADAPTERS,
    configuredCount: INTEROP_ADAPTERS.filter((adapter) => adapter.status === "configured" || adapter.status === "connected").length,
  }, { headers: { "Cache-Control": "no-store" } });
}
