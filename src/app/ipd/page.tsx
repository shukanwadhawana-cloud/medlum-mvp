"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

/**
 * IPD board — census + open clinical chart.
 * Full structured IPD workspace (notes, indents, handover) is being restored
 * from the pre-placeholder revision; this build keeps the board usable.
 */
export default function IPDPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/ipd", { credentials: "include", cache: "no-store" });
      if (!r.ok) {
        setError(r.status === 401 ? "Session expired — please log in again." : "Could not load IPD census.");
        return;
      }
      const d = await r.json();
      const ps = d.patients || [];
      setPatients(ps);
      setRooms(d.rooms || []);
      if (selected?.id) {
        const fresh = ps.find((p: any) => p.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch {
      setError("Network error loading IPD.");
    } finally {
      setLoading(false);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (!authLoading && doctor) void load();
  }, [authLoading, doctor, load]);

  if (authLoading || !doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">
        Loading...
      </div>
    );
  }

  return (
    <AppShell>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">IPD & Hospital Management</h2>
            <p className="text-xs text-gray-500">Census · open clinical chart · room directory</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="h-9 px-3 rounded-lg border text-xs font-medium"
          >
            Refresh
          </button>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {msg && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}

        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="border-b px-3 py-3">
              <h3 className="text-sm font-semibold">IPD Census</h3>
            </div>
            <div className="divide-y">
              {loading ? (
                <div className="p-6 text-center text-sm text-gray-500">Loading…</div>
              ) : patients.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">No IPD patients registered.</div>
              ) : (
                patients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p)}
                    className={`w-full px-3 py-3 text-left hover:bg-gray-50 ${
                      selected?.id === p.id ? "bg-gray-50" : ""
                    }`}
                  >
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{p.name}</p>
                        <p className="text-[11px] text-gray-500">
                          {p.age} yrs · {p.gender} · {p.phone}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-600">
                          {p.wardType || "Ward"} · Room {p.roomNumber || "Unassigned"}
                        </p>
                      </div>
                      <div className="text-right text-[11px]">
                        {p.consultantName && <p className="font-medium">{p.consultantName}</p>}
                        {p.workingDiagnosis && (
                          <p className="mt-1 text-gray-500">{p.workingDiagnosis}</p>
                        )}
                      </div>
                    </div>
                    {p.allergies && (
                      <span className="mt-2 inline-block rounded-full bg-red-50 px-2 py-1 text-[10px] text-red-700">
                        Allergy: {p.allergies}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-white p-3 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Hospital Room / Bed Directory</h3>
            <div className="max-h-[560px] space-y-2 overflow-auto">
              {rooms.length === 0 ? (
                <p className="text-xs text-gray-500">No rooms listed.</p>
              ) : (
                rooms.map((r: any) => (
                  <div key={r.id} className="flex justify-between rounded-lg border p-2.5">
                    <div>
                      <p className="text-sm font-medium">Room / Bed {r.roomNumber}</p>
                      <p className="text-[11px] text-gray-500">
                        {r.roomCategory} · {r.unitType}
                      </p>
                    </div>
                    <span className="h-fit rounded-full px-2 py-1 text-[10px]">
                      {r.occupied ? "Occupied" : "Available"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {selected && (
          <section className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Clinical workspace · {selected.name}</h3>
                <p className="text-[11px] text-gray-500">
                  {selected.wardType || "Ward"} · Room {selected.roomNumber || "—"} ·{" "}
                  {selected.consultantName || "No consultant listed"}
                </p>
                <p className="text-[11px] text-gray-500">
                  Complaint: {selected.chiefComplaint || "—"} · Dx:{" "}
                  {selected.workingDiagnosis || selected.diagnosis || "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/patients/${selected.id}/chart`}
                  className="inline-flex h-9 items-center rounded-lg bg-[#c2183a] px-3 text-xs font-medium text-white"
                >
                  Clinical chart
                </Link>
                <Link
                  href={`/patients/${selected.id}`}
                  className="inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium"
                >
                  Full record
                </Link>
                <Link
                  href="/ipd-summaries"
                  className="inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium"
                >
                  IPD summaries
                </Link>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-gray-500">
              Open the clinical chart for CPRS-style overview, vitals entry, orders, Rx, and notes.
              Register / handover / transfer actions remain on the API; full IPD workspace UI is being
              restored in a follow-up commit.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
