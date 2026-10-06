"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

export default function EmergencyPage() {
  const { doctor, loading } = useDoctor();
  const [cases, setCases] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [dataLoading, setDataLoading] = useState(true);

  const reload = useCallback(async () => {
    setDataLoading(true);
    try {
      const res = await fetch("/api/emergency", { credentials: "include", cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not load emergency data");
      setCases(Array.isArray(j.cases) ? j.cases : Array.isArray(j) ? j : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load emergency data");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && doctor) reload();
  }, [loading, doctor, reload]);

  if (loading || !doctor) {
    return <AppShell><p className="text-sm text-gray-500">Loading…</p></AppShell>;
  }

  const active = cases.filter((c) => !/closed|discharged|cancelled/i.test(String(c.status || "")));

  return (
    <AppShell>
      <section className="medlum-dashboard-hero mb-4">
        <div>
          <p className="medlum-eyebrow">EMERGENCY</p>
          <h1>Emergency & Ambulance</h1>
          <p>Rapid registration, triage, disposition — reuses authorized patient identity.</p>
        </div>
        <Link href="/dashboard" className="medlum-primary inline-flex items-center justify-center" style={{ textDecoration: "none" }}>
          Dashboard
        </Link>
      </section>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white rounded-xl border p-3"><div className="text-[11px] text-gray-500">Active</div><div className="text-xl font-bold">{dataLoading ? "…" : active.length}</div></div>
        <div className="bg-white rounded-xl border p-3"><div className="text-[11px] text-gray-500">Total loaded</div><div className="text-xl font-bold">{dataLoading ? "…" : cases.length}</div></div>
        <div className="bg-white rounded-xl border p-3"><div className="text-[11px] text-gray-500">Patient search</div><Link href="/patients" className="text-sm font-semibold text-[#c2183a]">Open index</Link></div>
      </div>
      <section className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">Active emergency cases</h3></div>
        {dataLoading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
        ) : active.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No active emergency cases.</div>
        ) : (
          <div className="divide-y">
            {active.map((c) => (
              <div key={c.id} className="px-3 py-3 flex justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{c.patientName || c.patientId || "Case"}</p>
                  <p className="text-xs text-gray-500">{c.status} · {c.triage || "Triage n/a"}</p>
                </div>
                {c.patientId && <Link href={`/patients/${c.patientId}`} className="text-xs text-[#c2183a] font-medium">Chart</Link>}
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
