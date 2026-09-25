"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiAddPharmacyItem, apiCreateDispensing, apiGetPharmacy, apiUpdateDispensing, apiUpdatePharmacyItem } from "@/lib/api";

export default function PharmacyPage() {
  const [data, setData] = useState<{ items: any[]; prescriptions: any[]; dispensings: any[] }>({ items: [], prescriptions: [], dispensings: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", genericName: "", form: "", batchNumber: "", expiryDate: "", quantity: "", reorderLevel: "", unit: "units" });

  async function load() {
    setLoading(true);
    setData(await apiGetPharmacy());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addItem() {
    if (!form.name.trim()) return;
    setSaving(true); setMessage("");
    const res = await apiAddPharmacyItem({ ...form, quantity: Number(form.quantity || 0), reorderLevel: Number(form.reorderLevel || 0) });
    setSaving(false);
    if (!res.success) { setMessage(res.error || "Could not add medicine"); return; }
    setForm({ name: "", genericName: "", form: "", batchNumber: "", expiryDate: "", quantity: "", reorderLevel: "", unit: "units" });
    setMessage("Medicine added to inventory.");
    await load();
  }

  async function queuePrescription(id: string) {
    const res = await apiCreateDispensing(id);
    setMessage(res.success ? "Prescription added to pharmacy queue." : (res.error || "Could not queue prescription"));
    await load();
  }

  async function updateDispensing(id: string, status: string) {
    const res = await apiUpdateDispensing(id, status);
    setMessage(res.success ? `Dispensing marked ${status.toLowerCase()}.` : (res.error || "Could not update dispensing"));
    await load();
  }

  async function adjustStock(item: any, delta: number) {
    const res = await apiUpdatePharmacyItem({ id: item.id, quantity: Math.max(0, Number(item.quantity) + delta) });
    if (!res.success) setMessage(res.error || "Could not update stock");
    await load();
  }

  const lowStock = data.items.filter((i) => Number(i.quantity) <= Number(i.reorderLevel));
  const pending = useMemo(() => data.prescriptions.filter((p) => !data.dispensings.some((d) => d.prescriptionId === p.id || d.status === "Pending" && d.prescriptionId === p.id)), [data]);
  const pendingDispensing = data.dispensings.filter((d) => d.status === "Pending");

  return (
    <AppShell>
    <main className="mx-auto max-w-6xl p-0">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Pharmacy</h1>
        <p className="mt-1 text-sm text-slate-500">Prescription fulfillment and clinic medicine inventory.</p>
      </div>

      {message && <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">{message}</div>}

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4"><div className="text-xs text-slate-500">Inventory</div><div className="mt-1 text-2xl font-semibold">{data.items.length}</div></div>
        <div className="rounded-2xl border bg-white p-4"><div className="text-xs text-slate-500">Prescriptions</div><div className="mt-1 text-2xl font-semibold">{data.prescriptions.length}</div></div>
        <div className="rounded-2xl border bg-white p-4"><div className="text-xs text-slate-500">Pending dispensing</div><div className="mt-1 text-2xl font-semibold">{data.dispensings.filter((d) => d.status === "Pending").length}</div></div>
        <div className="rounded-2xl border bg-white p-4"><div className="text-xs text-slate-500">Low stock</div><div className="mt-1 text-2xl font-semibold">{lowStock.length}</div></div>
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-4 sm:p-5 order-3">
        <h2 className="text-lg font-semibold">Inventory receiving / stock adjustment</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">Stock is tracked manually for now; prescriptions remain the clinical source of truth.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["name","Medicine name"],["genericName","Generic name"],["form","Form"],["batchNumber","Batch number"],["expiryDate","Expiry date"],["quantity","Quantity"],["reorderLevel","Reorder level"],["unit","Unit"]].map(([key,label]) => (
            <input key={key} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={label} className="rounded-xl border px-3 py-2 text-sm" inputMode={key === "quantity" || key === "reorderLevel" ? "numeric" : undefined} />
          ))}
        </div>
        <button disabled={saving || !form.name.trim()} onClick={addItem} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving…" : "Add to inventory"}</button>
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Pharmacist dispensing queue</h2><p className="text-xs text-slate-500">Primary work queue: verify prescription, prepare medication, dispense, and reconcile stock.</p></div></div>
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : data.prescriptions.length === 0 ? <p className="text-sm text-slate-500">No prescriptions yet.</p> : <div className="space-y-3">
          {data.prescriptions.map((p) => {
            const d = data.dispensings.find((x) => x.prescriptionId === p.id);
            return <div key={p.id} className="rounded-xl border p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><div className="flex items-center gap-2"><div className="font-medium">{p.patientName}</div>{p.isIpd&&<span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">IPD Medication Indent</span>}</div><div className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{p.medicines}</div><div className="mt-1 text-xs text-slate-400">Prescription {p.id} · {new Date(p.createdAt).toLocaleString()}</div></div>
                {!d ? <button onClick={() => queuePrescription(p.id)} className="rounded-lg border px-3 py-2 text-sm">Send to pharmacy</button> : <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{d.status}</span>{d.status === "Pending" && <button onClick={() => updateDispensing(d.id, "Dispensed")} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Mark dispensed</button>}</div>}
              </div>
            </div>;
          })}
        </div>}
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="mb-1 text-lg font-semibold">Inventory</h2>
        <p className="mb-4 text-xs text-slate-500">Batch, expiry and stock visibility for clinic medicines.</p>
        {data.items.length === 0 ? <p className="text-sm text-slate-500">No medicines added yet.</p> : <div className="space-y-3">
          {data.items.map((item) => { const low = Number(item.quantity) <= Number(item.reorderLevel); return <div key={item.id} className="rounded-xl border p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-medium">{item.name}</div><div className="text-xs text-slate-500">{item.genericName || "Generic not entered"} · {item.form || "Form not entered"} · Batch {item.batchNumber || "—"}</div><div className="mt-1 text-xs text-slate-400">Expiry: {item.expiryDate || "—"}</div></div><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs ${low ? "bg-amber-100 text-amber-800" : "bg-slate-100"}`}>{item.quantity} {item.unit}{low ? " · Low stock" : ""}</span><button onClick={() => adjustStock(item, -1)} className="rounded-lg border px-3 py-2 text-sm">−</button><button onClick={() => adjustStock(item, 1)} className="rounded-lg border px-3 py-2 text-sm">+</button></div></div></div> })}
        </div>}
      </section>
    </main>
  </AppShell>
  );
}
