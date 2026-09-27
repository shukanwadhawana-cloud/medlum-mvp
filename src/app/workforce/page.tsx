"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

type StaffMember = {
  id: string;
  clinicId: string;
  doctorId: string;
  role: string;
  staffCode: string;
  designation: string;
  department: string;
  isActive: boolean;
  deactivatedAt?: string | null;
  telegramLinked: boolean;
  telegramUsername?: string | null;
  doctor?: { id: string; name: string; email: string; phone: string; isActive: boolean; deactivatedAt?: string | null };
};

const STAFF_ROLES = ["Admin","Manager","Consultant","Doctor","RMO","Nurse","Pharmacy","Laboratory","Billing","Receptionist","Staff"];
const ROLE_LABELS: Record<string, string> = { Nurse: "Sister / Nurse", Pharmacy: "Pharmacist", Laboratory: "Lab" };
type Tab = "staff" | "attendance" | "records";

export default function WorkforcePage() {
  const [tab, setTab] = useState<Tab>("staff");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [clinic, setClinic] = useState<{ id: string; name: string; isActive?: boolean } | null>(null);
  const [currentMember, setCurrentMember] = useState<{ id: string; role: string; staffCode?: string } | null>(null);
  const [counts, setCounts] = useState({ total: 0, active: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Consultant");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [duty, setDuty] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});

  const canManageStaff = useMemo(() => ["Owner", "Admin", "Manager"].includes(currentMember?.role || ""), [currentMember]);
  const canChangeRole = useMemo(() => ["Owner", "Admin"].includes(currentMember?.role || ""), [currentMember]);

  const loadStaff = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/clinic/staff?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load staff.");
      setMembers(body.members || []);
      setClinic(body.clinic || null);
      setCurrentMember(body.currentMember || null);
      setCounts(body.counts || { total: 0, active: 0, inactive: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load staff.");
      setMembers([]);
    } finally { setLoading(false); }
  }, [statusFilter, query]);

  const loadDuty = useCallback(async () => {
    try {
      const res = await fetch("/api/duty", { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setDuty(body);
    } catch { /* optional */ }
  }, []);

  const loadRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/workforce", { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setRecords(body.records || []); setRecordCounts(body.counts || {}); }
    } catch { /* optional */ }
  }, []);

  useEffect(() => { void loadStaff(); }, [loadStaff]);
  useEffect(() => {
    if (tab === "attendance") void loadDuty();
    if (tab === "records") void loadRecords();
  }, [tab, loadDuty, loadRecords]);

  async function createStaff(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/clinic/staff", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password, role, designation: designation || role, department }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create staff.");
      setMessage(`Staff created. Login ID: ${body.member?.staffCode || body.staffCode || "assigned"}. Share the password securely.`);
      setName(""); setEmail(""); setPhone(""); setPassword(""); setDesignation(""); setDepartment(""); setRole("Consultant"); setShowCreate(false);
      await loadStaff();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create staff."); }
    finally { setSaving(false); }
  }

  async function staffAction(member: StaffMember, action: "deactivate" | "reactivate" | "role" | "update-details", extra: Record<string, string> = {}) {
    setSaving(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/clinic/staff", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: member.id, ...extra }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Action failed.");
      setMessage(action === "deactivate" ? `Deactivated ${member.doctor?.name || "staff"}. Staff ID ${member.staffCode || ""} retained.` : action === "reactivate" ? `Reactivated ${member.doctor?.name || "staff"}.` : "Staff updated.");
      await loadStaff();
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed."); }
    finally { setSaving(false); }
  }

  async function linkTelegram(member: StaffMember) {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/clinic/staff", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "telegram-link", memberId: member.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not prepare Telegram link.");
      if (body.alreadyLinked) setMessage("Telegram already linked.");
      else if (body.deepLink) { window.open(body.deepLink, "_blank", "noopener,noreferrer"); setMessage("Open Telegram and complete linking."); }
      await loadStaff();
    } catch (err) { setError(err instanceof Error ? err.message : "Telegram link failed."); }
    finally { setSaving(false); }
  }

  async function punchDuty(type: "IN" | "OUT") {
    setSaving(true); setError(""); setMessage("");
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let accuracyMeters: number | null = null;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracyMeters = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null;
        } catch {
          /* geofence may not be required */
        }
      }
      const res = await fetch("/api/duty", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, lat, lng, accuracyMeters }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Punch failed");
      setMessage(`Punch ${type} recorded.`);
      await loadDuty();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Punch failed");
    } finally {
      setSaving(false);
    }
  }

  function formatElapsed(mins: number | null | undefined) {
    if (mins == null || !Number.isFinite(mins)) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h <= 0) return `${m}m`;
    return `${h}h ${m}m`;
  }

  function formatIstLocal(iso: string | Date | null | undefined) {
    if (!iso) return "—";
    const d = typeof iso === "string" ? new Date(iso) : iso;
    return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  }

  const activeStatus = (m: StaffMember) => m.isActive && m.doctor?.isActive !== false;

  return (
    <AppShell>
      <div className="mb-4 space-y-1">
        <div className="text-xs text-gray-500">
          <Link href="/dashboard" className="text-[#c2183a]">Dashboard</Link>{" · "}
          <Link href="/clinic" className="text-[#c2183a]">Clinic</Link>{" · "}
          <Link href="/duty" className="text-[#c2183a]">Duty</Link>
        </div>
        <h1 className="text-xl font-bold text-[#140a1f]">Staff & Workforce</h1>
        <p className="text-sm text-gray-600">{clinic?.name ? <>Facility: <span className="font-semibold text-[#140a1f]">{clinic.name}</span></> : "Selected facility staff directory, attendance, and workforce records."}</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {([["staff", "Staff directory"], ["attendance", "Attendance"], ["records", "Workforce records"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === id ? "bg-[#140a1f] text-white" : "border bg-white text-gray-700"}`}>{label}</button>
        ))}
      </div>

      {error ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div> : null}

      {tab === "staff" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, Staff ID, role, department…" className="h-11 min-w-[200px] flex-1 rounded-xl border px-3 text-sm" />
            <div className="flex gap-1 rounded-xl border bg-white p-1">
              {(["all", "active", "inactive"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatusFilter(s)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${statusFilter === s ? "bg-[#c2183a] text-white" : "text-gray-600"}`}>
                  {s}{s === "all" ? ` (${counts.total})` : s === "active" ? ` (${counts.active})` : ` (${counts.inactive})`}
                </button>
              ))}
            </div>
            {canManageStaff ? <button type="button" onClick={() => setShowCreate((v) => !v)} className="h-11 rounded-xl bg-[#c2183a] px-4 text-sm font-semibold text-white">{showCreate ? "Close form" : "Add staff"}</button> : null}
          </div>

          {showCreate && canManageStaff ? (
            <form onSubmit={createStaff} className="space-y-3 rounded-2xl border bg-white p-4">
              <div className="text-sm font-semibold">Add facility staff</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name *" className="h-11 rounded-xl border px-3 text-sm" />
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email *" className="h-11 rounded-xl border px-3 text-sm" />
                <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone *" className="h-11 rounded-xl border px-3 text-sm" />
                <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Initial password (min 8) *" className="h-11 rounded-xl border px-3 text-sm" />
                <select value={role} onChange={(e) => setRole(e.target.value)} className="h-11 rounded-xl border px-3 text-sm">{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}</select>
                <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Designation (optional)" className="h-11 rounded-xl border px-3 text-sm" />
                <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department (optional)" className="h-11 rounded-xl border px-3 text-sm sm:col-span-2" />
              </div>
              <p className="text-[11px] text-gray-500">Staff Login ID is allocated automatically and stays permanent after deactivation. Privileged roles may need Telegram linking before production login.</p>
              <button disabled={saving} type="submit" className="h-11 w-full rounded-xl bg-[#140a1f] text-sm font-semibold text-white disabled:opacity-50">{saving ? "Creating…" : "Create staff account"}</button>
            </form>
          ) : null}

          {loading ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500">Loading staff…</div>
          ) : members.length === 0 ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500">No staff match the current filters for this facility.</div>
          ) : (
            <div className="divide-y rounded-2xl border bg-white">
              {members.map((m) => {
                const active = activeStatus(m);
                const isOwnerRow = m.role === "Owner";
                return (
                  <div key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[#140a1f]">{m.doctor?.name || "Staff"}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{active ? "Active" : "Inactive"}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">{ROLE_LABELS[m.role] || m.role}</span>
                      </div>
                      <div className="text-xs text-gray-600">{m.staffCode ? <span className="mr-2 font-semibold text-[#140a1f]">ID {m.staffCode}</span> : null}{m.designation || m.role}{m.department ? ` · ${m.department}` : ""}</div>
                      <div className="truncate text-xs text-gray-500">{m.doctor?.email}{m.doctor?.phone ? ` · ${m.doctor.phone}` : ""}</div>
                      <div className="text-[11px] text-gray-500">{m.telegramLinked ? `Telegram linked${m.telegramUsername ? ` (@${m.telegramUsername})` : ""}` : ["Owner", "Admin", "Manager"].includes(m.role) ? "Telegram not linked" : "Telegram optional"}{!active && m.staffCode ? " · Staff ID retained" : ""}</div>
                    </div>
                    {canManageStaff && !isOwnerRow ? (
                      <div className="flex flex-wrap gap-2">
                        {canChangeRole ? (
                          <select defaultValue={m.role} disabled={saving} onChange={(e) => { const next = e.target.value; if (next && next !== m.role) void staffAction(m, "role", { role: next }); }} className="h-9 rounded-lg border px-2 text-xs">
                            {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                          </select>
                        ) : null}
                        <button type="button" disabled={saving} onClick={() => { const nextDes = window.prompt("Designation", m.designation || m.role); if (nextDes === null) return; const nextDept = window.prompt("Department", m.department || ""); if (nextDept === null) return; void staffAction(m, "update-details", { designation: nextDes, department: nextDept }); }} className="h-9 rounded-lg border px-2.5 text-xs font-medium">Edit details</button>
                        {["Owner", "Admin", "Manager"].includes(m.role) && !m.telegramLinked ? (
                          <button type="button" disabled={saving} onClick={() => void linkTelegram(m)} className="h-9 rounded-lg border border-[#229ED9] px-2.5 text-xs font-semibold text-[#1688bd]">Link Telegram</button>
                        ) : null}
                        {active ? (
                          <button type="button" disabled={saving} onClick={() => { if (window.confirm(`Deactivate ${m.doctor?.name}? Staff ID stays permanent. Historical records keep this identity.`)) void staffAction(m, "deactivate"); }} className="h-9 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800">Deactivate</button>
                        ) : (
                          <button type="button" disabled={saving} onClick={() => void staffAction(m, "reactivate")} className="h-9 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800">Reactivate</button>
                        )}
                      </div>
                    ) : isOwnerRow ? <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">Owner</span> : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "attendance" && (
        <section className="space-y-4">
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Duty & attendance</h2>
              <Link href="/duty" className="text-xs font-semibold text-[#c2183a]">Open full Duty desk →</Link>
            </div>
            {!duty ? (
              <p className="mt-3 text-sm text-gray-500">Loading attendance…</p>
            ) : (
              <>
                <div className="mt-3 rounded-xl border bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-gray-500">Your status · {duty.clinic?.name || clinic?.name || "Facility"}</div>
                      <div className={`mt-1 text-lg font-bold ${duty.me?.onDuty || duty.me?.status === "ON_DUTY" ? "text-emerald-700" : "text-gray-600"}`}>
                        {duty.me?.onDuty || duty.me?.status === "ON_DUTY" ? "ON DUTY" : "OFF DUTY"}
                      </div>
                      {duty.me?.dutyStartedAt ? (
                        <div className="mt-1 text-xs text-gray-500">
                          Started {formatIstLocal(duty.me.dutyStartedAt)} · elapsed {formatElapsed(duty.me.elapsedMinutes)}
                        </div>
                      ) : duty.me?.lastPunch ? (
                        <div className="mt-1 text-xs text-gray-500">
                          Last {duty.me.lastPunch.type} · {formatIstLocal(duty.me.lastPunch.punchedAt)}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-500">No punches yet for this facility</div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving || duty.me?.onDuty || duty.me?.status === "ON_DUTY"}
                        onClick={() => void punchDuty("IN")}
                        className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        Punch IN
                      </button>
                      <button
                        type="button"
                        disabled={saving || !(duty.me?.onDuty || duty.me?.status === "ON_DUTY")}
                        onClick={() => void punchDuty("OUT")}
                        className="h-11 rounded-xl bg-[#c2183a] px-4 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        Punch OUT
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Metric label="Today punches" value={String(duty.todayCount ?? duty.todayEvents?.length ?? 0)} />
                  <Metric label="On duty now" value={String(duty.onDutyBoard?.length ?? (duty.me?.onDuty ? 1 : 0))} />
                  <Metric label="Facility" value={duty.clinic?.name || clinic?.name || "—"} />
                </div>

                {Array.isArray(duty.onDutyBoard) && duty.onDutyBoard.length > 0 ? (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold">Currently on duty</h3>
                    <div className="mt-2 divide-y rounded-xl border">
                      {duty.onDutyBoard.map((row: any) => (
                        <div key={row.memberId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                          <div>
                            <span className="font-semibold text-[#140a1f]">{row.name}</span>
                            {row.staffCode ? <span className="ml-2 text-gray-500">ID {row.staffCode}</span> : null}
                            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5">{row.role}</span>
                          </div>
                          <div className="text-gray-500">since {formatIstLocal(row.dutyStartedAt)} · {formatElapsed(row.elapsedMinutes)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <h3 className="text-sm font-semibold">Today&apos;s attendance</h3>
                  {Array.isArray(duty.todayEvents) && duty.todayEvents.length > 0 ? (
                    <div className="mt-2 divide-y rounded-xl border">
                      {duty.todayEvents.slice(0, 40).map((ev: any) => (
                        <div key={ev.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                          <div>
                            <span className={`font-semibold ${ev.type === "IN" ? "text-emerald-700" : "text-red-700"}`}>{ev.type}</span>
                            {ev.staffName ? <span className="ml-2 font-medium text-[#140a1f]">{ev.staffName}</span> : null}
                            {ev.staffCode ? <span className="ml-2 text-gray-500">ID {ev.staffCode}</span> : null}
                            {ev.role ? <span className="ml-2 text-gray-500">{ev.role}</span> : null}
                            <span className="ml-2 text-gray-400">{ev.source}</span>
                          </div>
                          <span className="text-gray-500">{formatIstLocal(ev.punchedAt)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">No punches recorded today for this facility.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {tab === "records" && (
        <section className="space-y-4">
          <div className="rounded-2xl border bg-white p-4">
            <h2 className="font-semibold">Workforce records</h2>
            <p className="mt-1 text-xs text-gray-500">Scoped to the selected facility. Uses existing WorkforceRecord modules.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.keys(recordCounts).length === 0 ? <span className="text-sm text-gray-500">No workforce records yet for this facility.</span> : Object.entries(recordCounts).map(([mod, n]) => (
                <span key={mod} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium">{mod}: {n}</span>
              ))}
            </div>
            {records.length > 0 ? (
              <div className="mt-4 divide-y rounded-xl border">
                {records.slice(0, 20).map((r: any) => (
                  <div key={r.id} className="px-3 py-2">
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-[11px] text-gray-500">{r.module} · {r.recordType} · {r.status}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white px-3 py-2">
      <div className="text-lg font-semibold text-[#140a1f]">{value}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  );
}
