"use client";

import { useEffect, useState } from "react";

export default function ClinicPage() {
  const [data, setData] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Consultant");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/clinic", { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load clinic.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load clinic.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/clinic", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not add consultant.");
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add consultant.");
    } finally {
      setSaving(false);
    }
  }

  async function updateMember(id: string, nextRole: string) {
    const res = await fetch("/api/clinic", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role: nextRole }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Could not update member.");
    else await load();
  }

  async function removeMember(id: string) {
    if (!window.confirm("Remove this member from the clinic? Their existing clinical records will remain in the database.")) return;
    const res = await fetch("/api/clinic", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Could not remove member.");
    else await load();
  }

  if (loading) return <div className="text-sm text-gray-500">Loading clinic…</div>;
  if (error && !data) return <div className="rounded-xl bg-white p-4 text-sm text-red-600">{error}</div>;

  const canManage = ["Owner", "Admin"].includes(data?.currentMember?.role);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Clinic</h1>
        <p className="text-sm text-gray-500">Shared clinic workspace and consultant access.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">{data?.clinic?.name}</div>
            <div className="text-xs text-gray-500">Your role: {data?.currentMember?.role}</div>
          </div>
          <div className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">{data?.members?.length || 0} members</div>
        </div>
      </section>

      {canManage && (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900">Add existing MedLum user</h2>
          <p className="mt-1 text-xs text-gray-500">The doctor must already have a MedLum account. Adding them here gives access to this clinic's shared patient records.</p>
          <form onSubmit={addMember} className="mt-3 space-y-2">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="Doctor's MedLum email" className="w-full rounded-xl border px-3 py-2.5 text-sm" />
            <div className="flex gap-2">
              <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border px-3 py-2.5 text-sm bg-white">
                <option>Consultant</option>
                <option>Admin</option>
                <option>Staff</option>
              </select>
              <button disabled={saving} className="flex-1 rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Adding…" : "Add member"}</button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-gray-900">Clinic members</div>
        <div className="divide-y">
          {data?.members?.map((member: any) => (
            <div key={member.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">{member.doctor.name}</div>
                <div className="text-xs text-gray-500 truncate">{member.doctor.email}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {member.role === "Owner" ? <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">Owner</span> : canManage ? (
                  <>
                    <select value={member.role} onChange={(e) => updateMember(member.id, e.target.value)} className="rounded-lg border px-2 py-1.5 text-xs bg-white">
                      <option>Admin</option><option>Consultant</option><option>Staff</option>
                    </select>
                    <button onClick={() => removeMember(member.id)} className="text-xs text-red-600 px-1">Remove</button>
                  </>
                ) : <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">{member.role}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
