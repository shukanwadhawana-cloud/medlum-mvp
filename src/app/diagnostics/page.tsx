"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import {
  apiCreateDiagnosticOrder,
  apiGetDiagnostics,
  apiGetPatients,
  apiUpdateDiagnosticOrder,
} from "@/lib/api";
import { RADIOLOGY_CATALOG } from "@/lib/diagnostic-catalog";
import { formatIst } from "@/lib/time";

type Patient = { id: string; name: string; uhid?: string };
type DiagnosticOrder = {
  id: string;
  patientId: string;
  patientName: string;
  studyName: string;
  modality: string;
  bodyPart: string;
  indication: string;
  status: string;
  findings: string;
  impression: string;
  notes: string;
  orderedAt: string;
  performedAt?: string | null;
  reportedAt?: string | null;
  encounterId?: string | null;
};

const ACTIVE = new Set(["Ordered", "Performed"]);

function badge(status: string) {
  if (status === "Ordered") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "Performed") return "bg-blue-50 text-blue-800 border-blue-200";
  if (status === "Reported") return "bg-green-50 text-green-800 border-green-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

export default function DiagnosticsPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [orders, setOrders] = useState<DiagnosticOrder[]>([]);
  const [queueTab, setQueueTab] = useState<"active" | "history">("active");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [reportOrder, setReportOrder] = useState<DiagnosticOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    patientId: "",
    studyName: "",
    modality: "Other",
    bodyPart: "",
    indication: "",
    notes: "",
  });
  const [report, setReport] = useState({ findings: "", impression: "", notes: "" });

  const load = useCallback(async () => {
    const [pts, list] = await Promise.all([apiGetPatients(), apiGetDiagnostics()]);
    setPatients(pts as Patient[]);
    setOrders(list as DiagnosticOrder[]);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) {
      router.replace("/login");
      return;
    }
    void load();
  }, [doctor, authLoading, router, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter((o) =>
      queueTab === "active" ? ACTIVE.has(o.status) : !ACTIVE.has(o.status)
    );
    if (q) {
      list = list.filter(
        (o) =>
          o.patientName.toLowerCase().includes(q) ||
          o.studyName.toLowerCase().includes(q) ||
          o.modality.toLowerCase().includes(q) ||
          (o.encounterId || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, queueTab, search]);

  const groups = useMemo(() => {
    const map = new Map<string, { patientId: string; patientName: string; orders: DiagnosticOrder[] }>();
    for (const o of filtered) {
      const key = o.patientId || o.patientName;
      let g = map.get(key);
      if (!g) {
        g = { patientId: o.patientId, patientName: o.patientName, orders: [] };
        map.set(key, g);
      }
      g.orders.push(o);
    }
    return Array.from(map.values()).sort((a, b) => a.patientName.localeCompare(b.patientName));
  }, [filtered]);

  const counts = useMemo(
    () => ({
      active: orders.filter((o) => ACTIVE.has(o.status)).length,
      history: orders.filter((o) => !ACTIVE.has(o.status)).length,
      ordered: orders.filter((o) => o.status === "Ordered").length,
      performed: orders.filter((o) => o.status === "Performed").length,
      reported: orders.filter((o) => o.status === "Reported").length,
    }),
    [orders]
  );

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    const r = await apiCreateDiagnosticOrder(form);
    if (r.success) {
      setShowAdd(false);
      setForm({ patientId: "", studyName: "", modality: "Other", bodyPart: "", indication: "", notes: "" });
      await load();
    } else setError(r.error || "Could not create diagnostic order");
    setSaving(false);
  };

  const saveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportOrder) return;
    if (!report.findings.trim() || !report.impression.trim()) {
      setError("Findings and impression are required.");
      return;
    }
    setSaving(true);
    setError("");
    const r = await apiUpdateDiagnosticOrder({
      id: reportOrder.id,
      status: "Reported",
      findings: report.findings,
      impression: report.impression,
      notes: report.notes,
    });
    if (r.success) {
      setReportOrder(null);
      setReport({ findings: "", impression: "", notes: "" });
      await load();
    } else setError(r.error || "Could not save report");
    setSaving(false);
  };

  if (authLoading) {
    return (
      <AppShell>
        <p className="text-sm text-gray-500">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="medlum-dashboard-hero mb-4">
        <div>
          <p className="medlum-eyebrow">DIAGNOSTICS</p>
          <h1>Diagnostics</h1>
          <p>Imaging & studies · Ordered → Performed → Reported</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError("");
            setShowAdd(true);
          }}
          disabled={!patients.length}
          className="medlum-primary disabled:opacity-40"
        >
          + Order study
        </button>
      </section>

      {error && !showAdd && !reportOrder && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
          <p className="text-[11px] uppercase text-amber-700">Ordered</p>
          <p className="text-xl font-semibold text-amber-900">{counts.ordered}</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="text-[11px] uppercase text-blue-700">Performed</p>
          <p className="text-xl font-semibold text-blue-900">{counts.performed}</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50 p-3">
          <p className="text-[11px] uppercase text-green-700">Reported</p>
          <p className="text-xl font-semibold text-green-900">{counts.reported}</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setQueueTab("active")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            queueTab === "active" ? "bg-[#140a1f] text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Active ({counts.active})
        </button>
        <button
          type="button"
          onClick={() => setQueueTab("history")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            queueTab === "history" ? "bg-[#140a1f] text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          History ({counts.history})
        </button>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patient, study, modality…"
          className="min-h-9 min-w-[12rem] flex-1 rounded-lg border px-3 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {groups.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {queueTab === "active" ? "No active diagnostic studies." : "No historical reports in this view."}
          </div>
        ) : (
          <div className="divide-y">
            {groups.map((g) => (
              <div key={g.patientId} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{g.patientName}</p>
                    <p className="text-[11px] text-gray-500">
                      {g.orders.length} stud{g.orders.length === 1 ? "y" : "ies"}
                    </p>
                  </div>
                  <Link href={`/patients/${g.patientId}/chart`} className="text-xs font-medium text-[#c2183a]">
                    Chart
                  </Link>
                </div>
                <div className="mt-2 space-y-2">
                  {g.orders.map((o) => (
                    <div key={o.id} className="rounded-lg bg-gray-50 px-2.5 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{o.studyName}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                            <span className={`rounded border px-1.5 py-0.5 font-medium ${badge(o.status)}`}>
                              {o.status}
                            </span>
                            <span>{o.modality}</span>
                            {o.bodyPart ? <span>· {o.bodyPart}</span> : null}
                            <span>· {formatIst(o.orderedAt)}</span>
                            {o.encounterId ? <span>· Enc {o.encounterId.slice(0, 8)}</span> : null}
                          </p>
                          {o.impression && queueTab === "history" && (
                            <p className="mt-1 text-[11px] text-gray-600">Impression: {o.impression}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {o.status === "Ordered" && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiUpdateDiagnosticOrder({ id: o.id, status: "Performed" });
                                await load();
                              }}
                              className="rounded-md border bg-white px-2 py-1 text-[11px] font-medium"
                            >
                              Mark performed
                            </button>
                          )}
                          {(o.status === "Ordered" || o.status === "Performed") && (
                            <button
                              type="button"
                              onClick={() => {
                                setError("");
                                setReportOrder(o);
                                setReport({
                                  findings: o.findings || "",
                                  impression: o.impression || "",
                                  notes: o.notes || "",
                                });
                              }}
                              className="rounded-md bg-[#c2183a] px-2 py-1 text-[11px] font-semibold text-white"
                            >
                              Enter report
                            </button>
                          )}
                          {o.status === "Ordered" && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiUpdateDiagnosticOrder({ id: o.id, status: "Cancelled" });
                                await load();
                              }}
                              className="rounded-md px-2 py-1 text-[11px] text-red-600"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold">Order diagnostic study</h3>
            {error && <div className="my-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={create} className="mt-3 space-y-2.5">
              <select
                required
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Select patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.uhid ? ` · ${p.uhid}` : ""}
                  </option>
                ))}
              </select>
              <select
                required
                value={form.studyName}
                onChange={(e) => {
                  const study = RADIOLOGY_CATALOG.find((s) => s.name === e.target.value);
                  setForm({
                    ...form,
                    studyName: e.target.value,
                    modality: study?.modality || form.modality,
                  });
                }}
                className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Select study</option>
                {RADIOLOGY_CATALOG.map((s) => (
                  <option key={s.id || s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                value={form.modality}
                onChange={(e) => setForm({ ...form, modality: e.target.value })}
                placeholder="Modality"
                className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={form.bodyPart}
                onChange={(e) => setForm({ ...form, bodyPart: e.target.value })}
                placeholder="Body part"
                className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={form.indication}
                onChange={(e) => setForm({ ...form, indication: e.target.value })}
                placeholder="Clinical indication"
                className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes"
                className="min-h-16 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[#c2183a] py-2 text-sm text-white disabled:opacity-50">
                  {saving ? "Ordering…" : "Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reportOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold">Diagnostic report</h3>
            <p className="text-xs text-gray-500">
              {reportOrder.patientName} · {reportOrder.studyName}
            </p>
            {error && <div className="my-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={saveReport} className="mt-3 space-y-2.5">
              <textarea
                required
                value={report.findings}
                onChange={(e) => setReport({ ...report, findings: e.target.value })}
                placeholder="Findings"
                className="min-h-28 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <textarea
                required
                value={report.impression}
                onChange={(e) => setReport({ ...report, impression: e.target.value })}
                placeholder="Impression"
                className="min-h-20 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <textarea
                value={report.notes}
                onChange={(e) => setReport({ ...report, notes: e.target.value })}
                placeholder="Notes (optional)"
                className="min-h-16 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setReportOrder(null)} className="flex-1 rounded-lg border py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[#c2183a] py-2 text-sm text-white disabled:opacity-50">
                  {saving ? "Saving…" : "Save report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
