"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiCreateDiagnosticOrder, apiGetDiagnostics, apiGetPatients, apiUpdateDiagnosticOrder } from "@/lib/api";
import { RADIOLOGY_CATALOG } from "@/lib/diagnostic-catalog";
import { parseCareSetting } from "@/lib/patient-metadata";

type Patient = { id: string; name: string; notes?: string; uhid?: string; registrationNo?: string };
type DiagnosticOrder = { id: string; patientId: string; patientName: string; studyName: string; modality: string; bodyPart: string; indication: string; status: string; findings: string; impression: string; notes: string; orderedAt: string; performedAt?: string | null; reportedAt?: string | null };
type PatientGroup = { patient: Patient; orders: DiagnosticOrder[] };

export default function DiagnosticsPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [orders, setOrders] = useState<DiagnosticOrder[]>([]);
  const [filter, setFilter] = useState("all");
  const [careSetting, setCareSetting] = useState<"OPD" | "IPD">("OPD");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [reportOrder, setReportOrder] = useState<DiagnosticOrder | null>(null);
  const [form, setForm] = useState({ patientId: "", studyName: "", modality: "X-ray", bodyPart: "", indication: "", notes: "" });
  const [report, setReport] = useState({ findings: "", impression: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [pts, list] = await Promise.all([apiGetPatients(), apiGetDiagnostics()]);
    setPatients(pts as Patient[]);
    setOrders(list as DiagnosticOrder[]);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) { router.replace("/login"); return; }
    void load();
  }, [doctor, authLoading, router, load]);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const visible = useMemo(() => filter === "all" ? orders : orders.filter((o) => o.status === filter), [orders, filter]);
  const settingOrders = useMemo(() => visible.filter((o) => {
    const patient = patientById.get(o.patientId);
    return (parseCareSetting(patient?.notes || "") === "IPD" ? "IPD" : "OPD") === careSetting;
  }), [visible, patientById, careSetting]);
  const groups = useMemo<PatientGroup[]>(() => {
    const map = new Map<string, PatientGroup>();
    for (const order of settingOrders) {
      const patient = patientById.get(order.patientId) || { id: order.patientId, name: order.patientName };
      const group = map.get(order.patientId);
      if (group) group.orders.push(order);
      else map.set(order.patientId, { patient, orders: [order] });
    }
    return Array.from(map.values()).sort((a, b) => a.patient.name.localeCompare(b.patient.name));
  }, [settingOrders, patientById]);
  const counts = useMemo(() => ({
    ordered: settingOrders.filter((o) => o.status === "Ordered").length,
    performed: settingOrders.filter((o) => o.status === "Performed").length,
    reported: settingOrders.filter((o) => o.status === "Reported").length,
  }), [settingOrders]);
  const selectedStudy = useMemo(() => RADIOLOGY_CATALOG.find((item) => item.name === form.studyName), [form.studyName]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSaving(true);
    const r = await apiCreateDiagnosticOrder(form);
    if (r.success) { setShowAdd(false); setForm({ patientId: "", studyName: "", modality: "X-ray", bodyPart: "", indication: "", notes: "" }); await load(); }
    else setError(r.error || "Could not create diagnostic order");
    setSaving(false);
  };
  const markPerformed = async (order: DiagnosticOrder) => {
    setError(""); const r = await apiUpdateDiagnosticOrder({ id: order.id, status: "Performed" });
    if (r.success) await load(); else setError(r.error || "Could not update diagnostic order");
  };
  const cancel = async (order: DiagnosticOrder) => {
    setError(""); const r = await apiUpdateDiagnosticOrder({ id: order.id, status: "Cancelled" });
    if (r.success) await load(); else setError(r.error || "Could not cancel diagnostic order");
  };
  const openReport = (order: DiagnosticOrder) => { setError(""); setReportOrder(order); setReport({ findings: order.findings || "", impression: order.impression || "", notes: order.notes || "" }); };
  const saveReport = async (e: React.FormEvent) => {
    e.preventDefault(); if (!reportOrder) return; setSaving(true); setError("");
    const r = await apiUpdateDiagnosticOrder({ id: reportOrder.id, status: "Reported", ...report });
    if (r.success) { setReportOrder(null); setReport({ findings: "", impression: "", notes: "" }); await load(); } else setError(r.error || "Could not save diagnostic report");
    setSaving(false);
  };

  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;
  const tabs = [["all", "All"], ["Ordered", "Ordered"], ["Performed", "Performed"], ["Reported", "Reported"], ["Cancelled", "Cancelled"]];

  return <AppShell>
    <div className="flex items-center justify-between mb-4 gap-2">
      <div><h2 className="text-lg font-semibold">Diagnostics</h2><p className="text-xs text-gray-500">Patient-first diagnostic queue · OPD and IPD separated</p></div>
      <button onClick={() => { setError(""); setShowAdd(true); }} disabled={!patients.length} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-40">+ Order Study</button>
    </div>
    {error && !showAdd && !reportOrder && <div className="mb-3 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

    <div className="mb-3 rounded-xl border bg-gray-50 p-1"><div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Diagnostics care setting">
      {(["OPD", "IPD"] as const).map((setting) => <button key={setting} type="button" role="tab" aria-selected={careSetting === setting} onClick={() => setCareSetting(setting)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${careSetting === setting ? "bg-white text-[#140a1f] shadow-sm" : "text-gray-500"}`}>{setting}</button>)}
    </div></div>

    <div className="grid grid-cols-3 gap-2 mb-3"><button onClick={() => setFilter("Ordered")} className="text-left bg-amber-50 border border-amber-100 rounded-xl p-3"><p className="text-[11px] uppercase tracking-wide text-amber-700">Ordered</p><p className="text-xl font-semibold text-amber-900">{counts.ordered}</p></button><button onClick={() => setFilter("Performed")} className="text-left bg-blue-50 border border-blue-100 rounded-xl p-3"><p className="text-[11px] uppercase tracking-wide text-blue-700">Performed</p><p className="text-xl font-semibold text-blue-900">{counts.performed}</p></button><button onClick={() => setFilter("Reported")} className="text-left bg-green-50 border border-green-100 rounded-xl p-3"><p className="text-[11px] uppercase tracking-wide text-green-700">Reported</p><p className="text-xl font-semibold text-green-900">{counts.reported}</p></button></div>
    <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">{tabs.map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${filter === key ? "bg-[#c2183a] text-white border-[#c2183a]" : "bg-white text-gray-600"}`}>{label}</button>)}</div>

    <div className="space-y-2">
      {groups.length === 0 ? <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">No diagnostic orders for {careSetting} in this view.</div> : groups.map((group) => {
        const open = expanded[group.patient.id] ?? false;
        return <div key={group.patient.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <button type="button" onClick={() => setExpanded((x) => ({ ...x, [group.patient.id]: !open }))} className="w-full p-3 text-left flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="font-semibold text-sm truncate">{group.patient.name}</p><p className="text-[11px] text-gray-500">{group.patient.uhid || group.patient.registrationNo || "Patient"} · {group.orders.length} investigation{group.orders.length === 1 ? "" : "s"}</p></div>
            <span className="text-xs text-gray-500">{open ? "Hide" : "Show"}</span>
          </button>
          {open && <div className="border-t divide-y">{group.orders.map((o) => <div key={o.id} className="p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-sm truncate">{o.studyName}</p><p className="text-[11px] text-gray-500">{o.modality}{o.bodyPart ? ` · ${o.bodyPart}` : ""} · {new Date(o.orderedAt).toLocaleDateString()}</p><p className={`mt-1 text-[11px] ${o.status === "Reported" ? "text-green-700" : o.status === "Performed" ? "text-blue-700" : o.status === "Cancelled" ? "text-red-700" : "text-amber-700"}`}>{o.status}</p></div><Link href={`/patients/${o.patientId}`} className="text-xs text-[#c2183a] shrink-0">Patient</Link></div>{o.indication && <p className="mt-2 text-xs text-gray-600"><b>Indication:</b> {o.indication}</p>}{o.impression && <div className="mt-2 rounded-lg bg-green-50 border border-green-100 p-2 text-xs"><b>Impression:</b> {o.impression}</div>}{o.findings && <div className="mt-2 rounded-lg bg-gray-50 border p-2 text-xs whitespace-pre-wrap"><b>Findings:</b> {o.findings}</div>}<div className="mt-2 flex gap-2">{o.status === "Ordered" && <button onClick={() => markPerformed(o)} className="px-2.5 py-1.5 rounded-lg border text-[11px]">Mark performed</button>}{o.status === "Performed" && <button onClick={() => openReport(o)} className="px-2.5 py-1.5 rounded-lg bg-[#c2183a] text-white text-[11px]">Enter report</button>}{o.status === "Reported" && <button onClick={() => openReport(o)} className="px-2.5 py-1.5 rounded-lg border text-[11px]">Edit report</button>}{o.status === "Ordered" && <button onClick={() => cancel(o)} className="px-2.5 py-1.5 rounded-lg border text-red-600 text-[11px]">Cancel</button>}</div></div>)}</div>}
        </div>;
      })}
    </div>
    {patients.length === 0 && <p className="mt-3 text-xs text-gray-500">Add a patient before ordering a study.</p>}

    {showAdd && <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3"><div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl max-h-[90vh] overflow-y-auto"><h3 className="text-base font-semibold mb-3">Order Diagnostic Study · {careSetting}</h3>{error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}<form onSubmit={create} className="space-y-2.5"><select required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm"><option value="">Select patient</option>{patients.filter((p) => (parseCareSetting(p.notes || "") === "IPD" ? "IPD" : "OPD") === careSetting).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select required value={form.studyName} onChange={(e) => { const study = RADIOLOGY_CATALOG.find((item) => item.name === e.target.value); setForm({ ...form, studyName: e.target.value, modality: study?.modality || "Other", bodyPart: study?.category || "" }); }} className="w-full min-h-11 px-3 py-2 rounded-lg border text-sm"><option value="">Select investigation / radiodiagnosis study</option>{RADIOLOGY_CATALOG.map((item) => <option key={item.id} value={item.name}>{item.name}{item.isOutsourced ? " · Outsource" : " · In-house"}</option>)}</select>{selectedStudy && <div className="rounded-lg bg-gray-50 border p-2 text-[11px] text-gray-600"><div className="flex flex-wrap gap-1.5">{selectedStudy.isInpatientRoutine && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">IPD routine</span>}{selectedStudy.isOutsourced && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Outsource eligible</span>}{selectedStudy.requiresFasting && <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">Fasting required</span>}{selectedStudy.requiresContrastConsent && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">Contrast consent</span>}</div><p className="mt-1">Category: {selectedStudy.category}</p></div>}<input value={form.indication} onChange={(e) => setForm({ ...form, indication: e.target.value })} placeholder="Clinical indication (optional)" className="w-full h-11 px-3 rounded-lg border text-sm" /><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes / instructions (optional)" className="w-full min-h-20 px-3 py-2 rounded-lg border text-sm" /><div className="flex gap-2"><button type="button" onClick={() => setShowAdd(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button><button disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm disabled:opacity-60">{saving ? "Ordering…" : "Order"}</button></div></form></div></div>}
    {reportOrder && <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3"><div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl"><h3 className="text-base font-semibold">Diagnostic Report</h3><p className="text-xs text-gray-500 mt-1">{reportOrder.patientName} · {reportOrder.studyName}</p>{error && <div className="my-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}<form onSubmit={saveReport} className="mt-3 space-y-2.5"><textarea required value={report.findings} onChange={(e) => setReport({ ...report, findings: e.target.value })} placeholder="Findings" className="w-full min-h-28 px-3 py-2 rounded-lg border text-sm" /><textarea required value={report.impression} onChange={(e) => setReport({ ...report, impression: e.target.value })} placeholder="Impression / conclusion" className="w-full min-h-20 px-3 py-2 rounded-lg border text-sm" /><textarea value={report.notes} onChange={(e) => setReport({ ...report, notes: e.target.value })} placeholder="Report notes (optional)" className="w-full min-h-16 px-3 py-2 rounded-lg border text-sm" /><div className="flex gap-2"><button type="button" onClick={() => setReportOrder(null)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button><button disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm disabled:opacity-60">{saving ? "Saving…" : "Save report"}</button></div></form></div></div>}
  </AppShell>;
}
