import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { INTEROP_ADAPTERS } from "@/lib/interoperability/adapters";
import { ekaConfigured } from "@/lib/interoperability/eka";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adapters = INTEROP_ADAPTERS.map((adapter) =>
    adapter.id === "eka-abdm"
      ? { ...adapter, status: ekaConfigured() ? "configured" as const : "planned" as const }
      : adapter,
  );

  return NextResponse.json({
    version: "v1",
    core: "MedLum EMR",
    adapters,
    configuredCount: adapters.filter((adapter) => adapter.status === "configured" || adapter.status === "connected").length,
  }, { headers: { "Cache-Control": "no-store" } });
}
