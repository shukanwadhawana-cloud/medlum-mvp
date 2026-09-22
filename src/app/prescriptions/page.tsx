"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients, apiGetPrescriptions, apiAddPrescription } from "@/lib/api";
import { formatIst } from "@/lib/time";

type Patient = { id: string; name: string };
type Rx = { id: string; patientName: string; medicines: string; advice: string; createdAt: string };

export default function PrescriptionsPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [list, setList] = useState<Rx[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ patientId: "", medicines: "", advice: "" });
  const [dataLoading, setDataLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [pts, rxs] = await Promise.all([apiGetPatients(), apiGetPrescriptions()]);
    setPatients(pts as Patient[]);
    setList(rxs as Rx[]);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) {
      router.replace("/login");
      return;
    }
    refresh();
  }, [doctor, authLoading, router, refresh]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const p = patients.find((x) => x.id === form.patientId);
    if (!p) {
      setError("Select a patient");
      return;
    }
    if (!form.medicines.trim()) {
      setError("Enter medicines");
      return;
    }
    setSaving(true);
    try {
      const r = await apiAddPrescription({
        patientId: p.id,
        patientName: p.name,
        medicines: form.medicines.trim(),
        advice: form.advice.trim(),
      });
      if (r.success) {
        await refresh();
        setShowAdd(false);
        setForm({ patientId: "", medicines: "", advice: "" });
      } else setError(r.error || "Could not save prescription");
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !doctor)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>
    );

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h2 className="text-lg font-semibold">Prescriptions</h2>
          <p className="text-xs text-gray-500">Digital Rx</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError("");
            setShowAdd(true);
          }}
          disabled={!patients.length}
          className="h-9 rounded-lg bg-[#c2183a] px-3 text-sm font-medium text-white disabled:opacity-40"
        >
          + New Rx
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {dataLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No prescriptions yet.</div>
        ) : (
          <div className="divide-y">
            {list.map((r) => (
              <div key={r.id} className="px-3 py-2.5">
                <div className="flex justify-between gap-2">
                  <p className="font-medium text-sm">{r.patientName}</p>
                  <span className="text-xs text-gray-400 shrink-0">{r.createdAt ? formatIst(r.createdAt) : ""}</span>
                </div>
                <div className="mt-1 flex gap-2">
                  <Link
                    href={`/prescriptions/print?id=${encodeURIComponent(r.id)}`}
                    className="text-[11px] font-medium text-[#c2183a]"
                  >
                    Print
                  </Link>
                </div>
                <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                  <b>Meds:</b> {r.medicines}
                </p>
                {r.advice ? (
                  <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">
                    <b>Advice:</b> {r.advice}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold mb-3">New Prescription</h3>
            {error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <form onSubmit={handleAdd} className="space-y-2.5">
              <select
                required
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border text-sm"
              >
                <option value="">Select patient *</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <textarea
                required
                rows={4}
                value={form.medicines}
                onChange={(e) => setForm({ ...form, medicines: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                placeholder={"Medicines *\nTab. Paracetamol 500mg 1-0-1 x 3 days\nCap. Amoxicillin 500mg 1-0-1 x 5 days"}
              />
              <textarea
                rows={2}
                value={form.advice}
                onChange={(e) => setForm({ ...form, advice: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                placeholder="Advice / instructions"
              />
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={() => setShowAdd(false)} className="flex-1 h-11 rounded-lg border text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm disabled:opacity-60">
                  {saving ? "Saving…" : "Save Rx"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
