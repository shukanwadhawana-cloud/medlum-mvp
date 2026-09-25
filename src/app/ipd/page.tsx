"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

function losLabel(admissionDate?: string | null) {
  if (!admissionDate) return "—";
  const start = new Date(admissionDate).getTime();
  if (Number.isNaN(start)) return "—";
  const ms = Date.now() - start;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  if (hours >= 1) return `${hours} hr ${mins} min`;
  return `${mins} min`;
}

export default function IPDCensusPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wardFilter, setWardFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/ipd", { credentials: "include", cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not load IPD census");
      setPatients(d.patients || []);
      setRooms(d.rooms || []);
    } catch (e: any) {
      setError(e.message || "Could not load IPD census");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && doctor) void load();
  }, [authLoading, doctor, load]);

  const specialties = useMemo(() => {
    const s = new Set<string>();
    patients.forEach((p) => {
      const v = p.department || p.specialty || p.consultantName;
      if (v) s.add(String(v));
    });
    return Array.from(s).sort();
  }, [patients]);

  const wards = useMemo(() => {
    const s = new Set<string>();
    patients.forEach((p) => {
      if (p.wardType) s.add(String(p.wardType));
    });
    rooms.forEach((r) => {
      if (r.unitType) s.add(String(r.unitType));
    });
    return Array.from(s).sort();
  }, [patients, rooms]);

  const rows = useMemo(() => {
    return patients.filter((p) => {
      if (wardFilter && String(p.wardType || "") !== wardFilter) return false;
      if (specialtyFilter) {
        const hay = [p.department, p.specialty, p.consultantName].map((x) => String(x || "")).join(" ");
        if (!hay.includes(specialtyFilter)) return false;
      }
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [p.name, p.uhid, p.registrationNo, p.id, p.roomNumber, p.consultantName]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q));
    });
  }, [patients, wardFilter, specialtyFilter, search]);

  if (authLoading || !doctor)
    return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;

  return (
    <AppShell>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">IPD Census</h2>
            <p className="text-xs text-gray-500">Horizontal ward board · LOS · specialty filters</p>
          </div>
          <Link href="/patients" className="h-9 px-3 rounded-lg border text-xs inline-flex items-center">
            Deep patient search
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 items-center bg-white border rounded-xl px-3 py-2 text-xs">
          <label className="text-gray-500">Ward:</label>
          <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)} className="h-8 rounded border px-2">
            <option value="">All</option>
            {wards.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          <label className="text-gray-500 ml-2">Specialty:</label>
          <select value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)} className="h-8 rounded border px-2 max-w-[180px]">
            <option value="">All</option>
            {specialties.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient / bed / UHID…"
            className="h-8 rounded border px-2 flex-1 min-w-[140px] ml-auto"
          />
        </div>

        {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[#f6f4f8] text-[10px] uppercase tracking-wide text-gray-500 border-b">
              <tr>
                <th className="px-2 py-2">S.No</th>
                <th className="px-2 py-2">Patient ID</th>
                <th className="px-2 py-2">Patient Name</th>
                <th className="px-2 py-2">Age/Gender</th>
                <th className="px-2 py-2">Date of Admission</th>
                <th className="px-2 py-2">LOS</th>
                <th className="px-2 py-2">Ward Location</th>
                <th className="px-2 py-2">Room / Bed</th>
                <th className="px-2 py-2">Specialty</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-500">No active IPD patients in this filter.</td></tr>
              ) : (
                rows.map((p, i) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-2 py-2 font-mono text-[11px]">{p.uhid || p.registrationNo || p.id.slice(0, 8)}</td>
                    <td className="px-2 py-2 font-semibold text-sm">
                      {p.name}
                      {p.allergies ? <span className="ml-1 text-red-600 text-[10px]">⚠</span> : null}
                    </td>
                    <td className="px-2 py-2">{p.age}/{p.gender}</td>
                    <td className="px-2 py-2">
                      {p.admissionDate ? new Date(p.admissionDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-2 py-2">{losLabel(p.admissionDate)}</td>
                    <td className="px-2 py-2">{p.wardType || "—"}</td>
                    <td className="px-2 py-2">{p.roomNumber || "Unassigned"}</td>
                    <td className="px-2 py-2 max-w-[160px] truncate">{p.department || p.consultantName || "—"}</td>
                    <td className="px-2 py-2">
                      <Link href={`/ipd/${p.id}`} className="text-[#c2183a] font-medium hover:underline">Workspace</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!loading && <div className="px-3 py-2 border-t text-[10px] text-gray-400">Showing {rows.length} of {patients.length} active admissions</div>}
        </div>

        <section className="bg-white rounded-xl border shadow-sm p-3">
          <h3 className="font-semibold text-sm mb-2">Beds</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto">
            {rooms.map((r: any) => (
              <div key={r.id} className="border rounded-lg p-2.5 flex justify-between">
                <div>
                  <p className="font-medium text-sm">Bed {r.roomNumber}</p>
                  <p className="text-[11px] text-gray-500">{r.roomCategory} · {r.unitType}</p>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full h-fit ${r.occupied ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700"}`}>
                  {r.occupied ? "Occupied" : "Available"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
