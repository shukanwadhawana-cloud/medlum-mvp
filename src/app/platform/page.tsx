"use client";

import { useEffect, useState } from "react";
import { apiLogout } from "@/lib/api";
import { useRouter } from "next/navigation";

type Data = any;

export default function PlatformPage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ clinicId:"", status:"ACTIVE", patientLimit:"200", dueDate:"", plan:"Pilot" });
  const [staff, setStaff] = useState({ name:"", email:"", password:"", role:"PlatformSupport" });

  async function load() {
    const r = await fetch("/api/platform", { credentials:"include", cache:"no-store" });
    if (r.status === 401 || r.status === 403) { router.replace("/platform/login"); return; }
    const j = await r.json(); if (!r.ok) { setError(j.error || "Unable to load platform"); return; }
    setData(j);
  }
  useEffect(() => { load(); }, []);

  async function subscription(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const r = await fetch("/api/platform", { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include", body:JSON.stringify({ action:"subscription", ...form }) });
    const j = await r.json(); setBusy(false); if (!r.ok) setError(j.error || "Update failed"); else await load();
  }
  async function createStaff(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const r = await fetch("/api/platform", { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include", body:JSON.stringify({ action:"create-user", ...staff }) });
    const j = await r.json(); setBusy(false); if (!r.ok) setError(j.error || "Could not create user"); else { setStaff({name:"",email:"",password:"",role:"PlatformSupport"}); }
  }
  if (!data) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-6xl">{error ? <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p> : <p>Loading MedLum Platform…</p>}</div></main>;

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><div className="text-xs font-semibold uppercase tracking-widest text-slate-500">MedLum Platform</div><h1 className="text-3xl font-bold">Founder Dashboard</h1><p className="text-sm text-slate-500">Viewer role: {data.viewer.role}</p></div>
        <button onClick={async()=>{await apiLogout(); router.replace("/platform/login")}} className="rounded-lg border bg-white px-4 py-2 text-sm">Sign out</button>
      </header>
      {error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[['Clinics',data.summary.clinics],['Active',data.summary.activeClinics],['Suspended',data.summary.suspendedClinics],['Doctors',data.summary.doctors],['Patients',data.summary.patients],['Collected',`₹${Math.round(data.summary.totalCollected).toLocaleString('en-IN')}`],['Pending',`₹${Math.round(data.summary.pendingPayments).toLocaleString('en-IN')}`]].map(([k,v])=><div key={k as string} className="rounded-xl border bg-white p-4"><div className="text-xs text-slate-500">{k}</div><div className="mt-1 text-xl font-bold">{v}</div></div>)}
      </section>

      <section className="mt-7 rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Clinics & subscriptions</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">Clinic</th><th className="p-2">Doctors</th><th className="p-2">Patients</th><th className="p-2">Limit</th><th className="p-2">Plan</th><th className="p-2">Status</th><th className="p-2">Due</th><th className="p-2">Collected</th><th className="p-2">Pending</th></tr></thead><tbody>{data.clinics.map((c:any)=><tr key={c.id} className="border-b"><td className="p-2 font-medium">{c.name}</td><td className="p-2">{c.doctors.length}</td><td className="p-2">{c.patients}</td><td className="p-2">{c.subscription.patientLimit}</td><td className="p-2">{c.subscription.plan}</td><td className="p-2">{c.subscription.status}</td><td className="p-2">{c.subscription.dueDate ? new Date(c.subscription.dueDate).toLocaleDateString('en-IN') : '—'}</td><td className="p-2">₹{Math.round(c.collected).toLocaleString('en-IN')}</td><td className="p-2">₹{Math.round(c.invoicePendingAmount).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div></section>

      {data.viewer.role === "PlatformAdmin" && <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <form onSubmit={subscription} className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Manage subscription</h2><select className="mt-4 w-full rounded-lg border p-3" value={form.clinicId} onChange={e=>setForm({...form,clinicId:e.target.value})} required><option value="">Select clinic</option>{data.clinics.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select><div className="mt-3 grid grid-cols-2 gap-3"><input className="rounded-lg border p-3" type="number" min="1" value={form.patientLimit} onChange={e=>setForm({...form,patientLimit:e.target.value})} placeholder="Patient limit"/><select className="rounded-lg border p-3" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>ACTIVE</option><option>PAST_DUE</option><option>SUSPENDED</option><option>CANCELLED</option></select></div><div className="mt-3 grid grid-cols-2 gap-3"><input className="rounded-lg border p-3" value={form.plan} onChange={e=>setForm({...form,plan:e.target.value})} placeholder="Plan"/><input className="rounded-lg border p-3" type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></div><button disabled={busy} className="mt-4 rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white">Save subscription</button></form>
        <form onSubmit={createStaff} className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Create platform team login</h2><div className="mt-4 grid gap-3"><input className="rounded-lg border p-3" value={staff.name} onChange={e=>setStaff({...staff,name:e.target.value})} placeholder="Full name" required/><input className="rounded-lg border p-3" type="email" value={staff.email} onChange={e=>setStaff({...staff,email:e.target.value})} placeholder="Email" required/><input className="rounded-lg border p-3" type="password" minLength={8} value={staff.password} onChange={e=>setStaff({...staff,password:e.target.value})} placeholder="Temporary password (8+ chars)" required/><select className="rounded-lg border p-3" value={staff.role} onChange={e=>setStaff({...staff,role:e.target.value})}><option>PlatformSupport</option><option>PlatformDeveloper</option><option>PlatformBilling</option><option>PlatformAdmin</option></select></div><button disabled={busy} className="mt-4 rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white">Create login</button></form>
      </div>}
    </div>
  </main>;
}
