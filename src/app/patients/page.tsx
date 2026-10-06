"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients } from "@/lib/api";

type ViewMode = "active" | "appointments" | "emergency" | "search";

function losDays(admissionDate?: string | null) {
  if (!admissionDate) return "—";
  const start = new Date(admissionDate).getTime();
  if (Number.isNaN(start)) return "—";
  const days = Math.max(0, Math.floor((Date.now() - start) / 86400000));
  if (days === 0) return "<1 day";
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function PatientsPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>("active");
  const [showOPD, setShowOPD] = useState(true);
  const [showIPD, setShowIPD] = useState(true);
  const [deepName, setDeepName] = useState("");
  const [deepDob, setDeepDob] = useState("");
  const [deepPhone, setDeepPhone] = useState("");
  const [deepIp, setDeepIp] = useState("");
  const [quickSearch, setQuickSearch] = useState("");

  const load = useCallback(async (searchParams = "") => {
    setLoading(true);
    setError("");
    try {
      setPatients(await apiGetPatients(searchParams));
    } catch (e: any) {
      setError(e?.message || "Could not load patients");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && doctor && view !== "search") void load(`?view=${encodeURIComponent(view)}`);
  }, [authLoading, doctor, load, view]);

  const runDeepSearch = useCallback(() => {
    const params = new URLSearchParams();
    params.set("view", "search");
    params.set("includeDischarged", "1");
    const name = deepName.trim();
    const phone = deepPhone.trim();
    const ip = deepIp.trim();
    if (name) params.set("name", name);
    if (phone) params.set("phone", phone);
    if (ip) params.set("identifier", ip);
    if (deepDob.trim()) params.set("dateOfBirth", deepDob.trim());
    void load(`?${params.toString()}`);
  }, [deepName, deepPhone, deepIp, deepDob, load]);

  const activeRows = useMemo(() => {
    const scoped = patients.filter((p) => {
      if (p.deletedAt) return false;
      const status = String(p.status || "ACTIVE").toUpperCase();
      if (status === "DISCHARGED" || status === "INACTIVE") return false;
      const setting = String(p.careSetting || "OPD").toUpperCase();
      return (setting === "OPD" && showOPD) || (setting === "IPD" && showIPD);
    });
    const q = quickSearch.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((p) =>
      [p.name, p.phone, p.id, p.uhid, p.registrationNo, p.medlumId]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q))
    );
  }, [patients, showOPD, showIPD, quickSearch]);

  const deepHits = useMemo(() => {
    if (view !== "search") return [];
    return patients;
  }, [patients, view]);

  const appointmentRows = useMemo(() => patients.filter((p) => Number(p.appointmentsCount || 0) > 0), [patients]);
  const emergencyRows = useMemo(() => patients.filter((p) => Number(p.emergencyCaseCount || 0) > 0), [patients]);
  const rows = view === "search" ? deepHits : view === "appointments" ? appointmentRows : view === "emergency" ? emergencyRows : activeRows;

  if (authLoading || !doctor)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>
    );

  return (
    <AppShell>
      <div className="space-y-4">\n        <section className="medlum-dashboard-hero medlum-index-hero">\n          <div><p className="medlum-eyebrow">MEDLUM · PATIENT INDEX</p><h1>Patient Index</h1><p>Active clinical census, appointments, emergency cases and deep historical lookup.</p></div>\n          <Link href="/patients/new" className="medlum-primary inline-flex items-center justify-center">+ Register patient</Link>\n        </section>\n        <div className="p-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Patient Search</h2>
            <p className="text-xs text-gray-500">Active census · deep lookup keeps discharged patients off the main list</p>
          </div>
          <Link href="/patients/new" className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-xs font-medium inline-flex items-center">
            + Register patient
          </Link>
        </div>

        <div className="flex flex-wrap gap-3 text-xs bg-white border rounded-xl px-3 py-2">
          {(
            [
              ["active", "Default (active)"],
              ["appointments", "Appointments"],
              ["emergency", "Emergency"],
              ["search", "Deep search"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="patientView" checked={view === key} onChange={() => setView(key)} />
              {label}
            </label>
          ))}
          <span className="ml-auto flex items-center gap-3 text-gray-500">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showOPD} onChange={(e) => setShowOPD(e.target.checked)} /> OPD
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showIPD} onChange={(e) => setShowIPD(e.target.checked)} /> IPD
            </label>
          </span>
        </div>

        {view === "search" ? (
          <div className="bg-white rounded-xl border shadow-sm p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Specific in-depth lookup</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <input value={deepName} onChange={(e) => setDeepName(e.target.value)} placeholder="Name (Last, First or partial)" className="h-10 rounded-lg border px-3 text-sm" />
              <input value={deepDob} onChange={(e) => setDeepDob(e.target.value)} placeholder="Date of birth DD/MM/YYYY" className="h-10 rounded-lg border px-3 text-sm" />
              <input value={deepPhone} onChange={(e) => setDeepPhone(e.target.value)} placeholder="Phone No." className="h-10 rounded-lg border px-3 text-sm" />
              <input value={deepIp} onChange={(e) => setDeepIp(e.target.value)} placeholder="IP / UHID / Registration No." className="h-10 rounded-lg border px-3 text-sm" />
            </div>
            <button type="button" onClick={runDeepSearch} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-xs font-medium">Search records</button>
            <p className="text-[11px] text-gray-400">Discharged and historical patients are searched from the server and remain off the active census.</p>
          </div>
        ) : (
          <input
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="Filter active list: name, phone, UHID, MedLum ID…"
            className="w-full h-10 rounded-lg border px-3 text-sm bg-white"
          />
        )}

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto -mx-1 px-1">
          <p className="sm:hidden px-2 pt-2 text-[10px] text-gray-400">Swipe sideways to see all columns</p>
          <table className="min-w-[920px] w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[#f6f4f8] text-[10px] uppercase tracking-wide text-gray-500 border-b">
              <tr>
                <th className="sticky left-0 z-20 bg-[#f6f4f8] px-2 py-2 font-semibold whitespace-nowrap">Index</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap">Patient ID</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap">Patient Name</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap">Age / Gender</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap">Setting</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap">Date of Admission</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap">LOS</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap">Ward / Bed</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap">Specialty</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-500">
                    {view === "search" ? "Enter search criteria to find historical or inactive patients." : "No patients in this view."}
                  </td>
                </tr>
              ) : (
                rows.map((p, i) => {
                  const setting = String(p.careSetting || "OPD").toUpperCase();
                  const isIPD = setting === "IPD";
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white px-2 py-2 text-gray-500 font-medium whitespace-nowrap">{i + 1}</td>
                      <td className="px-2 py-2 font-mono text-[11px] whitespace-nowrap">{p.uhid || p.registrationNo || p.medlumId || p.id.slice(0, 8)}</td>
                      <td className="px-2 py-2 font-semibold text-sm whitespace-nowrap max-w-[180px] truncate">{p.name}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{p.age} / {p.gender}</td>
                      <td className="px-2 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isIPD ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}`}>
                          {isIPD ? "IPD" : "OPD"}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {p.admissionDate ? new Date(p.admissionDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-2 py-2">{isIPD ? losDays(p.admissionDate) : "—"}</td>
                      <td className="px-2 py-2">{isIPD ? `${p.wardType || "Ward"}${p.roomNumber ? ` · ${p.roomNumber}` : ""}` : "—"}</td>
                      <td className="px-2 py-2 max-w-[140px] truncate">{p.department || p.consultantName || "—"}</td>
                      <td className="px-2 py-2">
                        <Link href={isIPD ? `/ipd/${p.id}` : `/patients/${p.id}`} className="text-[#c2183a] font-medium hover:underline">Open</Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {!loading && rows.length > 0 && (
            <div className="px-3 py-2 border-t text-[10px] text-gray-400">Showing {rows.length} of {rows.length} entries</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
