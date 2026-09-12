"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiCreateLabOrder, apiGetLabOrders, apiGetPatients, apiUpdateLabOrder } from "@/lib/api";
import { LAB_CATALOG } from "@/lib/diagnostic-catalog";

type Patient = { id: string; name: string };
type LabOrder = { id: string; patientId: string; patientName: string; testName: string; category: string; status: string; result: string; notes: string; orderedAt: string; resultedAt?: string | null };

export default function LabsPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [resultOrder, setResultOrder] = useState<LabOrder | null>(null);
  const [form, setForm] = useState({ patientId: "", testName: "", category: "Laboratory", notes: "" });
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedTest = useMemo(() => LAB_CATALOG.find((item) => item.name === form.testName), [form.testName]);

  const load = useCallback(async () => {
    const [pts, list] = await Promise.all([apiGetPatients(), apiGetLabOrders()]);
    setPatients(pts as Patient[]); setOrders(list as LabOrder[]);
  }, []);

  useEffect(() => { if (authLoading) return; if (!doctor) { router.replace("/login"); return; } load(); }, [doctor, authLoading, router, load]);

  const visible = useMemo(() => filter === "all" ? orders : orders.filter((o) => o.status === filter), [orders, filter]);
  const counts = useMemo(() => ({ ordered: orders.filter((o) => o.status === "Ordered").length, collected: orders.filter((o) => o.status === "Collected").length, resulted: orders.filter((o) => o.status === "Resulted").length }), [orders]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSaving(true);
    const r = await apiCreateLabOrder(form);
    if (r.success) { setShowAdd(false); setForm({ patientId: "", testName: "", category: "Laboratory", notes: "" }); await load(); }
    else setError(r.error || "Could not create lab order");
    setSaving(false);
  };

  const setStatus = async (order: LabOrder, status: string) => {
    setError(""); const r = await apiUpdateLabOrder({ id: order.id, status });
    if (r.success) await load(); else setError(r.error || "Could not update lab order");
  };

  const saveResult = async (e: React.FormEvent) => {
    e.preventDefault(); if (!resultOrder) return; setSaving(true); setError("");
    const r = await apiUpdateLabOrder({ id: resultOrder.id, status: "Resulted", result });
    if (r.success) { setResultOrder(null); setResult(""); await load(); } else setError(r.error || "Could not save result");
    setSaving(false);
  };

  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;
  const tabs = [["all", "All"], ["Ordered", "Ordered"], ["Collected", "Collected"], ["Resulted", "Resulted"]];

  return <AppShell>
    <div className="flex items-center justify-between mb-4 gap-2"><div><h2 className="text-lg font-semibold">Laboratory</h2><p className="text-xs text-gray-500">Orders and results linked to the clinical record</p></div><button onClick={() => { setError(""); setShowAdd(true); }} disabled={!patients.length} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-40">+ Order Test</button></div>
    {error && !showAdd && !resultOrder && <div className="mb-3 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
    <div className="grid grid-cols-3 gap-2 mb-3"><button onClick={() => setFilter("Ordered")} className="text-left bg-amber-50 border border-amber-100 rounded-xl p-3"><p className="text-[11px] uppercase tracking-wide text-amber-700">Ordered</p><p className="text-xl font-semibold text-amber-900">{counts.ordered}</p></button><button onClick={() => setFilter("Collected")} className="text-left bg-blue-50 border border-blue-100 rounded-xl p-3"><p className="text-[11px] uppercase tracking-wide text-blue-700">Collected</p><p className="text-xl font-semibold text-blue-900">{counts.collected}</p></button><button onClick={() => setFilter("Resulted")} className="text-left bg-green-50 border border-green-100 rounded-xl p-3"><p className="text-[11px] uppercase tracking-wide text-green-700">Resulted</p><p className="text-xl font-semibold text-green-900">{counts.resulted}</p></button></div>
    <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">{tabs.map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${filter === key ? "bg-[#c2183a] text-white border-[#c2183a]" : "bg-white text-gray-600"}`}>{label}</button>)}</div>
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">{visible.length === 0 ? <div className="p-8 text-center text-gray-500 text-sm">No lab orders in this view.</div> : <div className="divide-y">{visible.map((o) => <div key={o.id} className="p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-sm truncate">{o.testName}</p><p className="text-xs text-gray-500">{o.patientName} · {new Date(o.orderedAt).toLocaleDateString()}</p><p className="mt-1 text-[11px] text-gray-500">{o.category} · <span className={o.status === "Resulted" ? "text-green-700" : o.status === "Collected" ? "text-blue-700" : "text-amber-700"}>{o.status}</span></p></div><Link href={`/patients/${o.patientId}`} className="text-xs text-[#c2183a] shrink-0">Patient</Link></div>{o.result ? <div className="mt-2 rounded-lg bg-gray-50 border p-2 text-xs whitespace-pre-wrap"><span className="font-medium">Result: </span>{o.result}</div> : null}<div className="mt-2 flex gap-2">{o.status === "Ordered" && <button onClick={() => setStatus(o, "Collected")} className="px-2.5 py-1.5 rounded-lg border text-[11px]">Mark collected</button>}{o.status === "Collected" && <button onClick={() => { setResultOrder(o); setResult(o.result); }} className="px-2.5 py-1.5 rounded-lg bg-[#c2183a] text-white text-[11px]">Enter result</button>}{o.status === "Ordered" && <button onClick={() => setStatus(o, "Cancelled")} className="px-2.5 py-1.5 rounded-lg border text-red-600 text-[11px]">Cancel</button>}</div></div>)}</div>}</div>
    {patients.length === 0 && <p className="mt-3 text-xs text-gray-500">Add a patient before ordering a test.</p>}
    {showAdd && <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3"><div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl max-h-[90vh] overflow-y-auto"><h3 className="text-base font-semibold mb-3">Order Laboratory Test</h3>{error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}<form onSubmit={create} className="space-y-2.5"><select required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm"><option value="">Select patient</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select required value={form.testName} onChange={(e) => { const test = LAB_CATALOG.find((item) => item.name === e.target.value); setForm({ ...form, testName: e.target.value, category: test?.category || "Laboratory" }); }} className="w-full min-h-11 px-3 py-2 rounded-lg border text-sm"><option value="">Select laboratory investigation</option>{LAB_CATALOG.map((item) => <option key={item.id} value={item.name}>{item.name}{item.isInpatientRoutine ? " · IPD routine" : ""}</option>)}</select>{selectedTest && <div className="rounded-lg bg-gray-50 border p-2 text-[11px] text-gray-600"><div className="flex flex-wrap gap-1.5">{selectedTest.isInpatientRoutine && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">IPD routine</span>}{selectedTest.requiresFasting && <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">Fasting required</span>}</div>{selectedTest.components?.length ? <p className="mt-1"><b>Includes:</b> {selectedTest.components.join(", ")}</p> : null}</div>}<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Clinical note / instructions (optional)" className="w-full min-h-20 px-3 py-2 rounded-lg border text-sm" /><div className="flex gap-2"><button type="button" onClick={() => setShowAdd(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button><button disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm disabled:opacity-60">{saving ? "Ordering…" : "Order"}</button></div></form></div></div>}
    {resultOrder && <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3"><div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl"><h3 className="text-base font-semibold">Enter Result</h3><p className="text-xs text-gray-500 mt-1">{resultOrder.patientName} · {resultOrder.testName}</p>{error && <div className="my-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}<form onSubmit={saveResult} className="mt-3 space-y-2.5"><textarea required value={result} onChange={(e) => setResult(e.target.value)} placeholder="Enter result / interpretation" className="w-full min-h-32 px-3 py-2 rounded-lg border text-sm" /><div className="flex gap-2"><button type="button" onClick={() => setResultOrder(null)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button><button disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm disabled:opacity-60">{saving ? "Saving…" : "Save result"}</button></div></form></div></div>}
  </AppShell>;
}
