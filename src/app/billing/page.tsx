"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentDoctor, getMyPatients, getMyInvoices, addInvoice, updateInvoiceStatus, Doctor, Patient, Invoice } from "@/lib/auth";

export default function BillingPage() {
  const router = useRouter();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ patientId: "", amount: "", note: "" });
  const refresh = () => setInvoices(getMyInvoices());

  useEffect(() => {
    const d = getCurrentDoctor();
    if (!d) { router.replace("/login"); return; }
    setDoctor(d); setPatients(getMyPatients()); refresh();
  }, [router]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const p = patients.find(x => x.id === form.patientId);
    if (!p) return;
    addInvoice({ patientId: p.id, patientName: p.name, amount: parseFloat(form.amount) || 0, note: form.note });
    refresh(); setShowAdd(false); setForm({ patientId: "", amount: "", note: "" });
  };

  const totalPending = invoices.filter(i => i.status !== "Paid").reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + i.amount, 0);

  if (!doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white">Loading...</div>;

  return (
    <AppShell doctor={doctor}>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div><h2 className="text-lg font-semibold">Billing</h2><p className="text-xs text-gray-500">Invoices</p></div>
        <button onClick={() => setShowAdd(true)} disabled={patients.length === 0} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-40">+ Invoice</button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Pending</p><p className="text-xl font-bold text-amber-600 mt-1">₹{totalPending}</p></div>
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Collected</p><p className="text-xl font-bold text-green-600 mt-1">₹{totalPaid}</p></div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {invoices.length === 0 ? <div className="p-6 text-center text-gray-500 text-sm">No invoices yet.</div> : (
          <div className="divide-y">{invoices.map(inv => (
            <div key={inv.id} className="px-3 py-2.5 flex justify-between gap-2 items-center">
              <div><p className="font-medium text-sm">{inv.patientName}</p><p className="text-xs text-gray-500">{inv.note || "Fee"} · {new Date(inv.createdAt).toLocaleDateString()}</p></div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm">₹{inv.amount}</p>
                <p className="text-xs">{inv.status}</p>
                {inv.status !== "Paid" && <button onClick={() => { updateInvoiceStatus(inv.id, "Paid"); refresh(); }} className="text-xs text-green-600">Mark Paid</button>}
              </div>
            </div>
          ))}</div>
        )}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl">
            <h3 className="text-base font-semibold mb-3">Create Invoice</h3>
            <form onSubmit={handleAdd} className="space-y-2.5">
              <select required value={form.patientId} onChange={e => setForm({...form, patientId: e.target.value})} className="w-full h-10 px-3 rounded-lg border text-sm">
                <option value="">Select patient</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" required min="1" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full h-10 px-3 rounded-lg border text-sm" placeholder="Amount ₹" />
              <input value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full h-10 px-3 rounded-lg border text-sm" placeholder="Note" />
              <div className="flex gap-2"><button type="button" onClick={() => setShowAdd(false)} className="flex-1 h-10 rounded-lg border text-sm">Cancel</button>
              <button type="submit" className="flex-1 h-10 rounded-lg bg-[#c2183a] text-white text-sm">Create</button></div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
