"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

type Patient = {
  id: string;
  name: string;
  age?: number | string;
  gender?: string;
  wardType?: string;
  roomNumber?: string;
  consultantName?: string;
  vitals?: { bp?: string; pulse?: string; spo2?: string; rr?: string };
  allergies?: string;
  workingDiagnosis?: string;
};

export default function NursingPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ipd", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load nursing census");
      setPatients(data.patients || []);
    } catch (err: any) {
      setError(err?.message || "Could not load nursing census");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && doctor) void load();
  }, [authLoading, doctor, load]);

  if (authLoading || !doctor) {
    return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Nursing</h1>
          <p className="text-xs text-gray-500">Nursing workspace · active inpatient census and bedside clinical access</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500">Active IPD patients</p>
            <p className="mt-1 text-2xl font-semibold">{loading ? "…" : patients.length}</p>
          </div>
          <Link href="/ipd" className="rounded-xl border bg-white p-4 hover:bg-gray-50">
            <p className="text-xs text-gray-500">IPD census</p>
            <p className="mt-1 text-sm font-semibold">Open beds & admissions →</p>
          </Link>
          <Link href="/patients" className="rounded-xl border bg-white p-4 hover:bg-gray-50">
            <p className="text-xs text-gray-500">Patients</p>
            <p className="mt-1 text-sm font-semibold">Open patient records →</p>
          </Link>
        </div>

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-3 py-3">
            <div>
              <h2 className="text-sm font-semibold">Current nursing census</h2>
              <p className="text-[11px] text-gray-500">Open an admitted patient for the existing clinical workspace.</p>
            </div>
            <button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-2 text-xs">Refresh</button>
          </div>

          {loading ? (
            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
          ) : patients.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">No active IPD patients.</div>
          ) : (
            <div className="divide-y">
              {patients.map((patient) => (
                <Link key={patient.id} href={`/ipd/${patient.id}`} className="block px-3 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{patient.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {patient.age ?? "—"} yrs · {patient.gender ?? "—"} · {patient.wardType || "Ward"} · Bed {patient.roomNumber || "Unassigned"}
                      </p>
                      {patient.workingDiagnosis && <p className="mt-1 text-[11px] text-gray-600">Dx: {patient.workingDiagnosis}</p>}
                      {patient.allergies && <p className="mt-1 text-[11px] text-red-700">⚠ Allergy: {patient.allergies}</p>}
                    </div>
                    <div className="shrink-0 text-right text-[10px] text-gray-500">
                      {patient.consultantName && <p>{patient.consultantName}</p>}
                      {patient.vitals && (
                        <p className="mt-1">
                          BP {patient.vitals.bp || "—"} · P {patient.vitals.pulse || "—"} · SpO₂ {patient.vitals.spo2 || "—"} · RR {patient.vitals.rr || "—"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] font-medium text-[#c2183a]">Open clinical workspace →</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
