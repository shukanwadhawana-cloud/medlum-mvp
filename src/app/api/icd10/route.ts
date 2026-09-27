import { NextResponse } from "next/server";

const ICD10_API = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const terms = String(searchParams.get("terms") || "").trim().slice(0, 100);
  if (!terms) return NextResponse.json({ results: [] });

  try {
    const url = new URL(ICD10_API);
    url.searchParams.set("sf", "code,name");
    url.searchParams.set("df", "code,name");
    url.searchParams.set("terms", terms);
    url.searchParams.set("count", "8");
    url.searchParams.set("maxList", "8");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ results: [] }, { status: 502 });

    const payload = await res.json();
    const codes: string[] = Array.isArray(payload?.[1]) ? payload[1] : [];
    const rows: any[] = Array.isArray(payload?.[3]) ? payload[3] : [];
    const results = rows.map((row, i) => ({
      code: String(row?.[0] || codes[i] || ""),
      name: String(row?.[1] || ""),
    })).filter((x) => x.code && x.name);

    return NextResponse.json({ results }, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" },
    });
  } catch {
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
