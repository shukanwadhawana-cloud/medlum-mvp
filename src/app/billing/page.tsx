"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients, apiGetInvoices, apiAddInvoice, apiUpdateInvoiceStatus } from "@/lib/api";

type Patient = { id: string; name: string };
type Invoice = { id: string; patientName: string; amount: number; status: string; note: string; createdAt: string };

export default function BillingPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ patientId: "", amount: "", note: "" });
  const [dataLoading, setDataLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [pts, invs] = await Promise.all([apiGetPatients(), apiGetInvoices()]);
    setPatients(pts as Patient[]);
    setInvoices(invs as Invoice[]);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) { router.replace("/login"); return; }
    refresh();
  }, [doctor, authLoading, router, refresh]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const p = patients.find((x) => x.id === form.patientId);
    if (!p) { setError("Select a patient"); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setError("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const r = await apiAddInvoice({ patientId: p.id, patientName: p.name, amount, note: form.note.trim() });
      if (r.success) { await refresh(); setShowAdd(false); setForm({ patientId: "", amount: "", note: "" }); }
      else setError(r.error || "Could not create invoice");
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  const totalPending = invoices.filter((i) => i.status !== "Paid").reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0);

  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div><h2 className="text-lg font-semibold">Billing</h2><p className="text-xs text-gray-500">Invoices</p></div>
        <button type="button" onClick={() => { setError(""); setShowAdd(true); }} disabled={patients.length === 0} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-40">+ Invoice</button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Pending</p><p className="text-xl font-bold text-amber-600 mt-1">{dataLoading ? "…" : `₹${totalPending}`}</p></div>
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Collected</p><p className="text-xl font-bold text-green-600 mt-1">{dataLoading ? "…" : `₹${totalPaid}`}</p></div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {dataLoading ? <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
          : invoices.length === 0 ? <div className="p-6 text-center text-gray-500 text-sm">No invoices yet.</div>
          : <div className="divide-y">{invoices.map((inv) => (
            <div key={inv.id} className="px-3 py-2.5 flex justify-between gap-2 items-center">
              <div><p className="font-medium text-sm">{inv.patientName}</p><p className="text-xs text-gray-500">{inv.note || "Fee"} · {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : ""}</p></div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm">₹{inv.amount}</p>
                <p className="text-xs">{inv.status}</p>
                {inv.status !== "Paid" && <button type="button" onClick={async () => { await apiUpdateInvoiceStatus(inv.id, "Paid"); await refresh(); }} className="text-xs text-green-600">Mark Paid</button>}
              </div>
            </div>
          ))}</div>}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl">
            <h3 className="text-base font-semibold mb-3">Create Invoice</h3>
            {error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <form onSubmit={handleAdd} className="space-y-2.5">
              <select required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm"><option value="">Select patient</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input type="number" required min="1" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" placeholder="Amount ₹" />
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" placeholder="Note (optional)" />
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={() => setShowAdd(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm disabled:opacity-60">{saving ? "Creating…" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
