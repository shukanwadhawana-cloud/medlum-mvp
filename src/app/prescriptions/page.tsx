"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients, apiGetPrescriptions, apiAddPrescription } from "@/lib/api";
import { formatIst } from "@/lib/time";
import {
  DISCONTINUE_REASONS,
  MED_DURATION_UNITS,
  MED_PRIORITIES,
  MED_ROUTES,
  MED_SCHEDULES,
  emptyMedOrderLine,
  formatMedOrderLine,
  type MedOrderLine,
} from "@/lib/med-order";

type Patient = { id: string; name: string };
type Rx = { id: string; patientId?: string; patientName: string; medicines: string; advice: string; createdAt: string };

export default function PrescriptionsPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [list, setList] = useState<Rx[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [patientId, setPatientId] = useState("");
  const [lines, setLines] = useState<MedOrderLine[]>([emptyMedOrderLine()]);
  const [advice, setAdvice] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [disc, setDisc] = useState<{ id: string; reason: string } | null>(null);

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
    void refresh();
  }, [doctor, authLoading, router, refresh]);

  function updateLine(i: number, patch: Partial<MedOrderLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const p = patients.find((x) => x.id === patientId);
    if (!p) {
      setError("Select a patient");
      return;
    }
    const valid = lines.filter((l) => l.medicineName.trim());
    if (!valid.length) {
      setError("Enter at least one medicine");
      return;
    }
    setSaving(true);
    try {
      const r = await apiAddPrescription({
        patientId: p.id,
        patientName: p.name,
        medicines: valid.map(formatMedOrderLine).join("\n"),
        advice: advice.trim(),
      });
      if (r.success) {
        await refresh();
        setShowAdd(false);
        setPatientId("");
        setLines([emptyMedOrderLine()]);
        setAdvice("");
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
          <p className="text-xs text-gray-500">CPRS-style order rows · schedule · PRN · priority</p>
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
                  <Link href={`/prescriptions/print?id=${encodeURIComponent(r.id)}`} className="text-[11px] font-medium text-[#c2183a]">
                    Print
                  </Link>
                  <button type="button" onClick={() => setDisc({ id: r.id, reason: "Duplicate Order" })} className="text-[11px] font-medium text-red-700">
                    Discontinue
                  </button>
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
          <div className="bg-white rounded-2xl w-full max-w-4xl p-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold mb-3">Order Medicines</h3>
            {error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <form onSubmit={handleAdd} className="space-y-2.5">
              <select required value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full h-11 px-3 rounded-lg border text-sm">
                <option value="">Select patient *</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="overflow-x-auto">
                <div className="min-w-[900px] space-y-1.5">
                  {lines.map((line, i) => (
                    <div key={i} className="flex items-center gap-1 bg-amber-50/50 rounded-lg p-1 border">
                      <input required value={line.medicineName} onChange={(e) => updateLine(i, { medicineName: e.target.value })} placeholder="Medicine" className="h-9 w-40 rounded border px-2 text-xs bg-white" />
                      <input value={line.dosage} onChange={(e) => updateLine(i, { dosage: e.target.value })} placeholder="Dose" className="h-9 w-20 rounded border px-2 text-xs bg-white" />
                      <select value={line.route} onChange={(e) => updateLine(i, { route: e.target.value })} className="h-9 w-28 rounded border text-xs bg-white">
                        {MED_ROUTES.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <select value={line.schedule} onChange={(e) => updateLine(i, { schedule: e.target.value })} className="h-9 w-40 rounded border text-xs bg-white">
                        {MED_SCHEDULES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <label className="text-[10px] flex items-center gap-1 px-1">
                        <input type="checkbox" checked={line.prn} onChange={(e) => updateLine(i, { prn: e.target.checked })} /> PRN
                      </label>
                      <input type="number" min={0} value={line.durationValue} onChange={(e) => updateLine(i, { durationValue: Number(e.target.value) || 0 })} className="h-9 w-12 rounded border text-xs bg-white" />
                      <select value={line.durationUnit} onChange={(e) => updateLine(i, { durationUnit: e.target.value })} className="h-9 w-16 rounded border text-[10px] bg-white">
                        {MED_DURATION_UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                      <select value={line.priority} onChange={(e) => updateLine(i, { priority: e.target.value })} className="h-9 w-24 rounded border text-xs bg-white">
                        {MED_PRIORITIES.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                      <input value={line.comment} onChange={(e) => updateLine(i, { comment: e.target.value })} placeholder="Comment" className="h-9 flex-1 rounded border px-2 text-xs bg-white" />
                      <button type="button" onClick={() => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)))} className="h-9 w-8 rounded border text-red-600 text-xs">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setLines((p) => [...p, emptyMedOrderLine()])} className="h-8 px-3 rounded border text-xs">
                + Line
              </button>
              <textarea rows={2} value={advice} onChange={(e) => setAdvice(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" placeholder="Advice / instructions" />
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={() => setShowAdd(false)} className="flex-1 h-11 rounded-lg border text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm disabled:opacity-60">
                  {saving ? "Saving…" : "Confirm Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {disc && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <h3 className="font-semibold text-sm">Discontinue Order</h3>
            <select value={disc.reason} onChange={(e) => setDisc({ ...disc, reason: e.target.value })} className="w-full h-10 rounded-lg border px-2 text-sm">
              {DISCONTINUE_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400">Electronic signature: logged-in clinician session.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDisc(null)} className="flex-1 h-10 rounded-lg border text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDisc(null);
                  setError(`Discontinue noted for ${disc.id.slice(0, 8)} · ${disc.reason}`);
                }}
                className="flex-1 h-10 rounded-lg bg-[#140a1f] text-white text-sm"
              >
                Sign & discontinue
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
