"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

type EkaStatus = {
  provider: "EKA_ABDM";
  configured: boolean;
  clinicId: string;
};

export default function ClinicPage() {
  const [data, setData] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Consultant");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ekaLoading, setEkaLoading] = useState(false);
  const [ekaStatus, setEkaStatus] = useState<EkaStatus | null>(null);
  const [ekaHipId, setEkaHipId] = useState("");
  const [ekaName, setEkaName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        fetch("/api/clinic", { credentials: "include", cache: "no-store" }),
        fetch("/api/patients", { credentials: "include", cache: "no-store" }),
      ]);
      const cj = await c.json();
      const pj = await p.json();
      if (!c.ok) throw new Error(cj.error || "Could not load clinic.");
      setData(cj);
      setPatients(pj.patients || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load clinic.");
    } finally {
      setLoading(false);
    }
  }

  async function loadEkaStatus() {
    try {
      const r = await fetch("/api/interoperability/eka/status", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setEkaStatus(j);
    } catch {
      // Integration status is supplementary; do not block the clinic page.
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (data?.currentMember && ["Owner", "Admin"].includes(data.currentMember.role)) void loadEkaStatus();
  }, [data?.currentMember]);

  async function onboardEka(e: React.FormEvent) {
    e.preventDefault();
    if (!ekaStatus?.clinicId || !ekaHipId.trim()) return;
    setEkaLoading(true); setError(""); setMessage("");
    try {
      const r = await fetch("/api/interoperability/eka/onboard", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId: ekaStatus.clinicId, hipId: ekaHipId.trim(), name: ekaName.trim() || data?.clinic?.name || "MedLum Clinic" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "EKA facility onboarding failed.");
      setMessage("EKA ABDM facility onboarding request completed successfully."); setEkaHipId(""); setEkaName("");
    } catch (e) { setError(e instanceof Error ? e.message : "EKA facility onboarding failed."); }
    finally { setEkaLoading(false); }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    const r = await fetch("/api/clinic", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(j.error || "Could not add member.");
    else { setEmail(""); setMessage("Member added."); await load(); }
    setSaving(false);
  }

  async function portal(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setMessage("");
    const r = await fetch("/api/portal/accounts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: selected, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(j.error || "Could not enable portal access.");
    else { setMessage(j.created ? "Patient portal access created." : "Patient portal access updated."); setPassword(""); }
    setSaving(false);
  }

  async function memberAction(action: "deactivate" | "reactivate" | "role", id: string, memberRole?: string) {
    const body: any = { id, action };
    if (action === "role") body.role = memberRole;
    const r = await fetch("/api/clinic", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(j.error || "Action failed.");
    else { setMessage(action === "deactivate" ? "Member deactivated." : action === "reactivate" ? "Member reactivated." : "Role updated."); await load(); }
  }

  async function clinicAction(action: "deactivate-clinic" | "reactivate-clinic") {
    if (!window.confirm(action === "deactivate-clinic" ? "Deactivate this clinic? Historical records will be preserved." : "Reactivate this clinic?")) return;
    const r = await fetch("/api/clinic", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(j.error || "Clinic access change failed.");
    else { setMessage(action === "deactivate-clinic" ? "Clinic deactivated. Historical records are preserved." : "Clinic reactivated."); await load(); }
  }

  if (loading) return <AppShell><div className="text-sm text-gray-500">Loading clinic…</div></AppShell>;
  if (error && !data) return <AppShell><div className="rounded-xl bg-white p-4 text-sm text-red-600">{error}</div></AppShell>;

  const canManage = ["Owner", "Admin"].includes(data?.currentMember?.role);
  const clinicActive = data?.clinic?.isActive !== false;

  return <AppShell>
    <div className="mb-4">
      <Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div><h1 className="text-xl font-bold">Clinic</h1><p className="text-sm text-gray-500">Shared workspace, consultant access and patient portal controls.</p></div>
        {canManage && <button onClick={() => clinicAction(clinicActive ? "deactivate-clinic" : "reactivate-clinic")} className="rounded-xl border px-3 py-2 text-xs font-medium">{clinicActive ? "Deactivate clinic" : "Reactivate clinic"}</button>}
      </div>
    </div>
    {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {message && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

    <section className="rounded-2xl bg-white p-4 border mb-3">
      <div className="flex items-center justify-between gap-3"><div className="text-lg font-semibold">{data?.clinic?.name}</div><span className={`rounded-full px-2.5 py-1 text-xs ${clinicActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{clinicActive ? "Active" : "Deactivated"}</span></div>
      <div className="text-xs text-gray-500">Your role: {data?.currentMember?.role} · {data?.members?.length || 0} members</div>
    </section>

    {canManage && clinicActive && <section className="rounded-2xl bg-white p-4 border mb-3">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">ABDM / EKA integration</h2><p className="text-xs text-gray-500 mt-1">Connect this clinic to EKA's ABDM facility onboarding flow.</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${ekaStatus?.configured ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{ekaStatus?.configured ? "Configured" : "Not configured"}</span></div>
      {ekaStatus?.configured ? <form onSubmit={onboardEka} className="mt-3 space-y-2"><input required value={ekaHipId} onChange={e => setEkaHipId(e.target.value)} placeholder="EKA HIP ID" className="w-full rounded-xl border px-3 py-2.5 text-sm"/><input value={ekaName} onChange={e => setEkaName(e.target.value)} placeholder={`Facility name (default: ${data?.clinic?.name || "clinic"})`} className="w-full rounded-xl border px-3 py-2.5 text-sm"/><button disabled={ekaLoading || !ekaHipId.trim()} className="w-full rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{ekaLoading ? "Connecting…" : "Onboard facility with EKA"}</button></form> : <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">EKA credentials are not configured on this deployment. The rest of MedLum continues to work normally.</p>}
    </section>}

    {canManage && clinicActive && <section className="rounded-2xl bg-white p-4 border mb-3"><h2 className="font-semibold">Patient Portal Access</h2><p className="text-xs text-gray-500 mt-1">Create or reset a patient's portal password. Patients only receive read-only access to their own records.</p><form onSubmit={portal} className="mt-3 space-y-2"><select required value={selected} onChange={e => setSelected(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm"><option value="">Select patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}</select><div className="flex gap-2"><input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Portal password (8+ characters)" className="flex-1 rounded-xl border px-3 py-2.5 text-sm"/><button disabled={saving} className="rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm text-white">{saving ? "Saving…" : "Enable / Reset"}</button></div></form><Link href="/portal/login" target="_blank" className="inline-block mt-3 text-xs text-[#c2183a]">Open patient portal login →</Link></section>}

    {canManage && clinicActive && <section className="rounded-2xl bg-white p-4 border mb-3"><h2 className="font-semibold">Add existing MedLum user</h2><p className="mt-1 text-xs text-gray-500">The doctor must already have a MedLum account.</p><form onSubmit={addMember} className="mt-3 space-y-2"><input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="Doctor's MedLum email" className="w-full rounded-xl border px-3 py-2.5 text-sm"/><div className="flex gap-2"><select value={role} onChange={e => setRole(e.target.value)} className="rounded-xl border px-3 py-2.5 text-sm bg-white"><option>Consultant</option><option>Admin</option><option>Staff</option></select><button disabled={saving} className="flex-1 rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white">{saving ? "Adding…" : "Add member"}</button></div></form></section>}

    <section className="rounded-2xl bg-white border overflow-hidden"><div className="px-4 py-3 border-b font-semibold">Clinic members</div><div className="divide-y">{data?.members?.map((m: any) => <div key={m.id} className="p-4 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-medium truncate">{m.doctor.name}</div><div className="text-xs text-gray-500 truncate">{m.doctor.email}</div><div className="mt-1 text-[11px] text-gray-500">{m.isActive && m.doctor.isActive ? "Active" : "Inactive"}</div></div>{m.role === "Owner" ? <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">Owner</span> : canManage && clinicActive ? <div className="flex gap-2 items-center"><select value={m.role} onChange={e => memberAction("role", m.id, e.target.value)} className="rounded-lg border px-2 py-1.5 text-xs"><option>Admin</option><option>Consultant</option><option>Staff</option></select><button onClick={() => memberAction(m.isActive ? "deactivate" : "reactivate", m.id)} className="text-xs text-[#c2183a]">{m.isActive ? "Deactivate" : "Reactivate"}</button></div> : <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">{m.role}</span>}</div>)}</div></section>
  </AppShell>;
}
