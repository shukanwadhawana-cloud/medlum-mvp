"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { EXPANDED_LAB_CATALOG, EXPANDED_RADIOLOGY_CATALOG } from "@/lib/diagnostic-catalog";

export default function IPDOrdersPage() {
  const { id } = useParams<{ id: string }>();
  const { doctor, loading } = useDoctor();
  const [tab, setTab] = useState<"lab" | "diagnostic">("lab");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const catalogue = tab === "lab" ? EXPANDED_LAB_CATALOG : EXPANDED_RADIOLOGY_CATALOG;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter((x: any) => [x.name, x.category, x.modality].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [catalogue, search]);

  async function placeOrder() {
    if (!id || !selected.length) return;
    setSaving(true); setMsg(""); setError("");
    try {
      const r = await fetch("/api/ipd", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: tab === "lab" ? "lab-order" : "diagnostic-order", patientId: id, tests: selected, notes }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || "Could not place order");
      setMsg(`${selected.length} ${tab === "lab" ? "laboratory" : "diagnostic"} order${selected.length === 1 ? "" : "s"} placed.`);
      setSelected([]); setNotes("");
    } catch (e: any) { setError(e.message || "Could not place order"); }
    finally { setSaving(false); }
  }

  if (loading) return <AppShell><div className="p-6 text-sm text-gray-500">Loading…</div></AppShell>;
  if (!doctor) return <AppShell><div className="p-6 text-sm text-gray-500">Sign in to order investigations.</div></AppShell>;

  return <AppShell><div className="p-4 max-w-5xl mx-auto">
    <div className="flex items-start justify-between gap-3 mb-4"><div><p className="text-[10px] uppercase tracking-wide text-[#c2183a] font-semibold">IPD Orders</p><h1 className="text-xl font-bold">Laboratory & Diagnostics</h1><p className="text-xs text-gray-500">Shared catalogue used by the clinical ordering workflow.</p></div><Link href={`/ipd/${id}/clinical`} className="h-9 px-3 rounded-lg border text-xs inline-flex items-center">Back to workspace</Link></div>
    {msg && <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}
    {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="flex border-b bg-slate-50"><button type="button" onClick={()=>{setTab("lab");setSelected([]);setSearch("")}} className={`flex-1 px-4 py-3 text-sm font-semibold ${tab==="lab"?"bg-white text-[#c2183a] border-b-2 border-[#c2183a]":"text-gray-600"}`}>Order Laboratory</button><button type="button" onClick={()=>{setTab("diagnostic");setSelected([]);setSearch("")}} className={`flex-1 px-4 py-3 text-sm font-semibold ${tab==="diagnostic"?"bg-white text-[#c2183a] border-b-2 border-[#c2183a]":"text-gray-600"}`}>Order Diagnostics</button></div>
      <div className="p-4"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${tab === "lab" ? "laboratory tests" : "diagnostics"}…`} className="h-10 w-full rounded-xl border px-3 text-sm"/>
        <div className="mt-3 max-h-[52vh] overflow-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{visible.map((x:any)=><button type="button" key={x.id||x.name} onClick={()=>setSelected(s=>s.includes(x.name)?s.filter(v=>v!==x.name):[...s,x.name])} className={`text-left rounded-xl border p-3 ${selected.includes(x.name)?"border-[#c2183a] bg-red-50":"bg-white hover:bg-gray-50"}`}><p className="text-xs font-semibold">{x.name}</p><p className="mt-1 text-[10px] text-gray-500">{x.category}{x.modality?` · ${x.modality}`:""}</p></button>)}</div>
        {!visible.length && <p className="p-8 text-center text-sm text-gray-500">No matching investigations.</p>}
        <div className="mt-4 border-t pt-3"><p className="text-xs font-semibold">Selected: {selected.length}</p><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Clinical indication / order notes" className="mt-2 w-full min-h-16 rounded-xl border px-3 py-2 text-xs"/><button type="button" onClick={placeOrder} disabled={saving||!selected.length} className="mt-2 h-10 rounded-xl bg-[#c2183a] px-4 text-xs font-semibold text-white disabled:opacity-50">{saving?"Placing…":`Place ${tab === "lab" ? "laboratory" : "diagnostic"} order${selected.length===1?"":"s"}`}</button></div>
      </div>
    </div>
  </div></AppShell>;
}
