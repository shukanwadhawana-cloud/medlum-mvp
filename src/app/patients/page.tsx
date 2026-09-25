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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPatients(await apiGetPatients());
    } catch (e: any) {
      setError(e?.message || "Could not load patients");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && doctor) void load();
  }, [authLoading, doctor, load]);

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
    const name = deepName.trim().toLowerCase();
    const phone = deepPhone.trim().replace(/\D/g, "");
    const ip = deepIp.trim().toLowerCase();
    const dob = deepDob.trim();
    if (!name && !phone && !ip && !dob) return [];
    return patients.filter((p) => {
      if (name && !String(p.name || "").toLowerCase().includes(name)) return false;
      if (phone && !String(p.phone || "").replace(/\D/g, "").includes(phone)) return false;
      if (ip) {
        const keys = [p.registrationNo, p.uhid, p.medlumId, p.id].map((x) => String(x || "").toLowerCase());
        if (!keys.some((k) => k.includes(ip))) return false;
      }
      if (dob) {
        const hay = [p.notes, p.registrationNo, p.dob, p.dateOfBirth].map((x) => String(x || "").toLowerCase()).join(" ");
        if (!hay.includes(dob.toLowerCase()) && !hay.includes(dob.replace(/\//g, "-"))) return false;
      }
      return true;
    });
  }, [patients, view, deepName, deepPhone, deepIp, deepDob]);

  const rows = view === "search" ? deepHits : activeRows;

  if (authLoading || !doctor)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>
    );

  return (
    <AppShell>
      <div className="p-4 space-y-3">
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
            <p className="text-[11px] text-gray-400">Discharged and historical patients appear here only when matched — not on the active census.</p>
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

        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[#f6f4f8] text-[10px] uppercase tracking-wide text-gray-500 border-b">
              <tr>
                <th className="px-2 py-2 font-semibold">S.No</th>
                <th className="px-2 py-2 font-semibold">Patient ID</th>
                <th className="px-2 py-2 font-semibold">Patient Name</th>
                <th className="px-2 py-2 font-semibold">Age / Gender</th>
                <th className="px-2 py-2 font-semibold">Setting</th>
                <th className="px-2 py-2 font-semibold">Date of Admission</th>
                <th className="px-2 py-2 font-semibold">LOS</th>
                <th className="px-2 py-2 font-semibold">Ward / Bed</th>
                <th className="px-2 py-2 font-semibold">Specialty</th>
                <th className="px-2 py-2 font-semibold">Action</th>
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
                      <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                      <td className="px-2 py-2 font-mono text-[11px]">{p.uhid || p.registrationNo || p.medlumId || p.id.slice(0, 8)}</td>
                      <td className="px-2 py-2 font-semibold text-sm">{p.name}</td>
                      <td className="px-2 py-2">{p.age} / {p.gender}</td>
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
