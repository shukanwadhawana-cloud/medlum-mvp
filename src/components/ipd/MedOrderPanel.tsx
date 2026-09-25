"use client";

import { useCallback, useEffect, useState } from "react";
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
import { apiAddPrescription, apiGetPrescriptions } from "@/lib/api";

type Props = {
  patient: { id: string; name: string };
  onOrdered?: () => void;
};

type RxRow = {
  id: string;
  medicines: string;
  advice: string;
  createdAt: string;
  status?: string;
  patientId?: string;
  patientName?: string;
};

const QUICK_FAVORITES: MedOrderLine[] = [
  { ...emptyMedOrderLine("PLASMALYTE A INJ"), dosage: "500 mL", route: "INTRAVENOUS", schedule: "CONTINUOUS", priority: "ROUTINE" },
  { ...emptyMedOrderLine("PARACETAMOL"), dosage: "1 g", route: "INTRAVENOUS", schedule: "Q6H(6,12,18&24HRS)", priority: "ROUTINE" },
  { ...emptyMedOrderLine("ONDANSETRON"), dosage: "4 mg", route: "INTRAVENOUS", schedule: "TID(6,14&22HRS)", priority: "ROUTINE" },
  { ...emptyMedOrderLine("PANTOPRAZOLE"), dosage: "40 mg", route: "INTRAVENOUS", schedule: "OD / DAILY", priority: "ROUTINE" },
  { ...emptyMedOrderLine("BISACODYL SUPP"), dosage: "10 mg", route: "RECTAL", schedule: "STAT(ONE TIME ONLY)", priority: "STAT" },
];

export default function MedOrderPanel({ patient, onOrdered }: Props) {
  const [lines, setLines] = useState<MedOrderLine[]>([emptyMedOrderLine()]);
  const [advice, setAdvice] = useState("");
  const [list, setList] = useState<RxRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [disc, setDisc] = useState<{ id: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    const all = (await apiGetPrescriptions()) as RxRow[];
    setList(
      all
        .filter((r) => r.patientId === patient.id || r.patientName === patient.name)
        .slice(0, 30)
    );
  }, [patient.id, patient.name]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateLine(i: number, patch: Partial<MedOrderLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyMedOrderLine()]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function applyFavorite(fav: MedOrderLine) {
    setLines((prev) => {
      const blank = prev.length === 1 && !prev[0].medicineName.trim();
      return blank ? [{ ...fav }] : [...prev, { ...fav }];
    });
  }

  async function confirmOrder(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const valid = lines.filter((l) => l.medicineName.trim());
    if (!valid.length) {
      setError("Add at least one medicine name");
      return;
    }
    for (const l of valid) {
      if (!l.route || !l.schedule) {
        setError("Each line needs route and schedule");
        return;
      }
    }
    setBusy(true);
    try {
      const medicines = valid.map(formatMedOrderLine).join("\n");
      const r = await apiAddPrescription({
        patientId: patient.id,
        patientName: patient.name,
        medicines,
        advice: advice.trim(),
      });
      if (!r.success) throw new Error(r.error || "Could not place order");
      setMsg(`Order confirmed · ${valid.length} line${valid.length === 1 ? "" : "s"}`);
      setLines([emptyMedOrderLine()]);
      setAdvice("");
      await load();
      onOrdered?.();
    } catch (err: any) {
      setError(err.message || "Order failed");
    } finally {
      setBusy(false);
    }
  }

  async function discontinue() {
    if (!disc) return;
    if (!disc.reason) {
      setError("Select a reason for discontinue");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/clinical-notes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({
          patientId: patient.id,
          noteType: "Progress Note",
          title: "Medication order discontinued",
          content: `DISCONTINUE ORDER ${disc.id}\nReason: ${disc.reason}\nSigned electronic discontinue per CPRS workflow.`,
          submit: false,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.success === false) throw new Error(body.error || "Could not record discontinue");
      setMsg(`Discontinue recorded: ${disc.reason}`);
      setDisc(null);
      await load();
    } catch (err: any) {
      setError(err.message || "Discontinue failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border rounded-xl p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-sm">Order Medicines</h4>
          <p className="text-[10px] text-gray-500">
            {patient.name} · horizontal CPRS row · dose · route · schedule · PRN · duration · priority · comment
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_FAVORITES.map((f) => (
            <button
              key={f.medicineName}
              type="button"
              onClick={() => applyFavorite(f)}
              className="h-7 px-2 rounded-full border text-[10px] hover:bg-gray-50"
              title="Add from quick list"
            >
              + {f.medicineName.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {(error || msg) && (
        <div className={`rounded-lg px-3 py-2 text-xs ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
          {error || msg}
        </div>
      )}

      <form onSubmit={confirmOrder} className="space-y-2">
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[1100px]">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1 mb-1">
              <span className="w-44 shrink-0">Medicine</span>
              <span className="w-24 shrink-0">Dosage</span>
              <span className="w-32 shrink-0">Route</span>
              <span className="w-44 shrink-0">Schedule</span>
              <span className="w-12 shrink-0">PRN</span>
              <span className="w-28 shrink-0">Duration</span>
              <span className="w-24 shrink-0">Priority</span>
              <span className="w-12 shrink-0">Now</span>
              <span className="flex-1">Comment</span>
              <span className="w-10 shrink-0" />
            </div>
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-1 mb-1.5 bg-amber-50/40 rounded-lg px-1 py-1 border border-amber-100/60">
                <input
                  required
                  value={line.medicineName}
                  onChange={(e) => updateLine(i, { medicineName: e.target.value })}
                  placeholder="e.g. PLASMALYTE A INJ"
                  className="h-9 w-44 shrink-0 rounded border px-2 text-xs bg-white"
                />
                <input
                  value={line.dosage}
                  onChange={(e) => updateLine(i, { dosage: e.target.value })}
                  placeholder="Dose"
                  className="h-9 w-24 shrink-0 rounded border px-2 text-xs bg-white"
                />
                <select
                  value={line.route}
                  onChange={(e) => updateLine(i, { route: e.target.value })}
                  className="h-9 w-32 shrink-0 rounded border px-1 text-xs bg-white"
                >
                  {MED_ROUTES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select
                  value={line.schedule}
                  onChange={(e) => updateLine(i, { schedule: e.target.value })}
                  className="h-9 w-44 shrink-0 rounded border px-1 text-xs bg-white"
                >
                  {MED_SCHEDULES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <label className="w-12 shrink-0 flex justify-center">
                  <input type="checkbox" checked={line.prn} onChange={(e) => updateLine(i, { prn: e.target.checked })} />
                </label>
                <div className="w-28 shrink-0 flex gap-0.5">
                  <input
                    type="number"
                    min={0}
                    value={line.durationValue}
                    onChange={(e) => updateLine(i, { durationValue: Number(e.target.value) || 0 })}
                    className="h-9 w-12 rounded border px-1 text-xs bg-white"
                  />
                  <select
                    value={line.durationUnit}
                    onChange={(e) => updateLine(i, { durationUnit: e.target.value })}
                    className="h-9 flex-1 rounded border px-0.5 text-[10px] bg-white"
                  >
                    {MED_DURATION_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={line.priority}
                  onChange={(e) => updateLine(i, { priority: e.target.value })}
                  className="h-9 w-24 shrink-0 rounded border px-1 text-xs bg-white"
                >
                  {MED_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <label className="w-12 shrink-0 flex justify-center">
                  <input
                    type="checkbox"
                    checked={line.additionalDoseNow}
                    onChange={(e) => updateLine(i, { additionalDoseNow: e.target.checked })}
                  />
                </label>
                <input
                  value={line.comment}
                  onChange={(e) => updateLine(i, { comment: e.target.value })}
                  placeholder="Diluent / note"
                  className="h-9 flex-1 min-w-[100px] rounded border px-2 text-xs bg-white"
                />
                <button type="button" onClick={() => removeLine(i)} className="h-9 w-10 shrink-0 rounded border text-red-600 text-xs" title="Remove">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" onClick={addLine} className="h-8 px-3 rounded-lg border text-xs">
            + Add line
          </button>
          <input
            value={advice}
            onChange={(e) => setAdvice(e.target.value)}
            placeholder="Order advice / special instructions"
            className="h-8 flex-1 min-w-[160px] rounded-lg border px-2 text-xs"
          />
          <button type="button" onClick={() => setLines([emptyMedOrderLine()])} className="h-8 px-3 rounded-lg border text-xs">
            Reset
          </button>
          <button disabled={busy} type="submit" className="h-8 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold disabled:opacity-50">
            {busy ? "Ordering…" : "Confirm Order"}
          </button>
        </div>
      </form>

      <div className="border-t pt-3">
        <h5 className="text-xs font-semibold text-gray-600 mb-2">Recent orders for this patient</h5>
        {list.length === 0 ? (
          <p className="text-[11px] text-gray-400">No medication orders yet.</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto text-xs">
            {list.map((rx) => (
              <li key={rx.id} className="border rounded-lg p-2 flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-[11px]">{rx.medicines}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{rx.createdAt ? new Date(rx.createdAt).toLocaleString("en-IN") : ""}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDisc({ id: rx.id, reason: "Duplicate Order" })}
                  className="shrink-0 h-7 px-2 rounded border text-[10px] text-red-700"
                >
                  Discontinue
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {disc && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl space-y-3">
            <h3 className="font-semibold text-sm">Discontinue Order</h3>
            <p className="text-[11px] text-gray-500">Order {disc.id.slice(0, 8)}… · electronic signature via logged-in clinician</p>
            <label className="block text-xs">
              Select Reason for Discontinue <span className="text-red-600">*</span>
              <select
                value={disc.reason}
                onChange={(e) => setDisc({ ...disc, reason: e.target.value })}
                className="mt-1 w-full h-10 rounded-lg border px-2 text-sm"
              >
                {DISCONTINUE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[10px] text-gray-400">Electronic Signature: current session clinician (double-sign clinical notes apply for final documents).</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDisc(null)} className="flex-1 h-10 rounded-lg border text-sm">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void discontinue()} className="flex-1 h-10 rounded-lg bg-[#140a1f] text-white text-sm disabled:opacity-50">
                Sign & discontinue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
