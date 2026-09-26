"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useParams } from "next/navigation";
import { useDoctor } from "@/components/DoctorProvider";

function dateValue(v: any) {
  const t = new Date(v || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export default function IPDTimelinePage() {
  const { id } = useParams<{ id: string }>();
  const { doctor, loading: authLoading } = useDoctor();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch("/api/ipd", { credentials: "include", cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not load IPD timeline");
      setData(d);
    } catch (e: any) {
      setError(e.message || "Could not load IPD timeline");
    }
  }, [id]);

  useEffect(() => {
    if (!authLoading && doctor) void load();
  }, [authLoading, doctor, load]);

  const patient = useMemo(() => {
    const all = [...(data?.patients || []), ...(data?.ipdHistory || [])];
    return all.find((p: any) => p.id === id) || null;
  }, [data, id]);

  const events = useMemo(() => {
    if (!patient) return [];
    const rows: any[] = [];
    const add = (items: any[], kind: string, title: (x: any) => string, when: (x: any) => any) => {
      for (const item of items || []) rows.push({ kind, title: title(item), when: when(item), item });
    };
    add(patient.clinicalNotes || patient.notes || [], "Clinical note", (x) => x.noteType || x.title || "Clinical note", (x) => x.createdAt || x.date || x.updatedAt);
    add(patient.labOrders || [], "Laboratory", (x) => `Lab: ${x.testName || x.name || "Investigation"}`, (x) => x.orderedAt || x.createdAt || x.date);
    add(patient.investigationOrders || [], "Investigation", (x) => `Investigation: ${x.testName || x.name || "Investigation"}`, (x) => x.orderedAt || x.createdAt || x.date);
    add(patient.diagnosticOrders || [], "Diagnostic", (x) => `Diagnostic: ${x.studyName || x.testName || x.name || "Imaging"}`, (x) => x.orderedAt || x.createdAt || x.date);
    add(patient.prescriptions || patient.medicationOrders || [], "Medication order", (x) => `Medication order: ${x.medicationName || x.name || x.medicines || "Medication"}`, (x) => x.createdAt || x.orderedAt || x.startDate);
    if (patient.admissionDate) rows.push({ kind: "Admission", title: "IPD admission", when: patient.admissionDate, item: patient });
    if (patient.dischargeDate || patient.status === "DISCHARGED") rows.push({ kind: "Discharge", title: "Patient discharged", when: patient.dischargeDate || patient.updatedAt, item: patient });
    return rows.sort((a, b) => dateValue(b.when) - dateValue(a.when));
  }, [patient]);

  if (authLoading) return <AppShell><div className="p-6 text-sm text-gray-500">Loading…</div></AppShell>;
  if (!doctor) return <AppShell><div className="p-6 text-sm text-gray-500">Sign in to view the IPD timeline.</div></AppShell>;

  return (
    <AppShell>
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#c2183a] font-semibold">IPD Clinical Timeline</p>
            <h1 className="text-xl font-bold">{patient?.name || "Patient"}</h1>
            <p className="text-xs text-gray-500">UHID {patient?.uhid || "—"} · {patient?.status || "IPD"}</p>
          </div>
          <Link href={`/ipd/${id}/clinical`} className="h-9 px-3 rounded-lg border text-xs inline-flex items-center">Back to workspace</Link>
        </div>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!patient ? <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">Patient record not found.</div> : (
          <section className="rounded-2xl border bg-white overflow-hidden">
            <div className="border-b px-4 py-3 text-sm font-semibold">Chronological clinical events</div>
            {events.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">No timeline events recorded yet.</div> : (
              <div className="divide-y">
                {events.map((e, i) => (
                  <div key={`${e.kind}-${i}`} className="p-4 flex gap-3">
                    <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#c2183a]" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">{e.kind}</p>
                      <p className="text-sm font-semibold">{e.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{e.when ? new Date(e.when).toLocaleString("en-IN") : "Time not recorded"}</p>
                      {e.kind === "Clinical note" && e.item?.content && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 border p-2 text-[11px] font-sans">{e.item.content}</pre>}
                      {e.item?.status && <p className="mt-1 text-[10px] text-gray-500">Status: {e.item.status}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
