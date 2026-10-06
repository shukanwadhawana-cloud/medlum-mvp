"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients } from "@/lib/api";

export default function IpdPage() {
  const { doctor, loading } = useDoctor();
  const [patients, setPatients] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [dataLoading, setDataLoading] = useState(true);

  const reload = useCallback(async () => {
    setDataLoading(true);
    try {
      const pts = await apiGetPatients();
      const list = Array.isArray(pts) ? pts : [];
      setPatients(list.filter((p) => (p.careSetting || "").toUpperCase() === "IPD" || /ipd/i.test(String(p.notes || ""))));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load IPD census");
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

  return (
    <AppShell>
      <div className="space-y-3">
        <section className="medlum-dashboard-hero">
          <div>
            <p className="medlum-eyebrow">INPATIENT</p>
            <h1>IPD Census</h1>
            <p>Ward board · patient continuity · deep search for historical charts</p>
          </div>
          <Link href="/patients" className="medlum-primary inline-flex items-center justify-center" style={{ textDecoration: "none" }}>
            Deep patient search
          </Link>
        </section>
        {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
        <section className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">Current IPD patients</h3></div>
          {dataLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading IPD census…</div>
          ) : patients.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No IPD patients in this facility view.</div>
          ) : (
            <div className="divide-y">
              {patients.map((p) => (
                <Link key={p.id} href={`/patients/${p.id}`} className="block px-3 py-3 hover:bg-gray-50">
                  <p className="font-semibold text-sm text-[#c2183a]">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.phone}</p>
                  {p.allergies ? <p className="text-xs text-red-700 mt-1">⚠ {p.allergies}</p> : null}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
