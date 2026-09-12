import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { linkEkaCareContexts } from "@/lib/interoperability/eka-care-context-adapter";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const careContexts = Array.isArray(body?.careContexts) ? body.careContexts : [];
    if (!body?.abhaAddress || !body?.oid || !body?.partnerUserId || !careContexts.length) {
      return NextResponse.json({ error: "abhaAddress, oid, partnerUserId and careContexts are required." }, { status: 400 });
    }

    const normalized = careContexts.map((item: any) => ({
      careContextId: String(item.careContextId || ""),
      display: String(item.display || "MedLum clinical record"),
      hiTypes: Array.isArray(item.hiTypes) ? item.hiTypes.map(String) : ["OPConsultation"],
      ...(typeof item.data === "string" ? { data: item.data } : {}),
    })).filter((item: any) => item.careContextId);

    if (!normalized.length) return NextResponse.json({ error: "At least one valid care context is required." }, { status: 400 });

    const result = await linkEkaCareContexts({
      abhaAddress: String(body.abhaAddress),
      careContexts: normalized,
      oid: String(body.oid),
      partnerUserId: String(body.partnerUserId),
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
    return NextResponse.json({ success: true, provider: result.provider, data: result.data ?? null }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to link ABDM care context." }, { status: 502 });
  }
}
