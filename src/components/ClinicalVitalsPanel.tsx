"use client";

import { useState } from "react";
import { apiCreateEncounter } from "@/lib/api";
import { formatIst } from "@/lib/time";

export function ClinicalVitalsPanel({
  patientId,
  encounters,
  onSaved,
}: {
  patientId: string;
  encounters: any[];
  onSaved: () => Promise<void> | void;
}) {
  const [vitalForm, setVitalForm] = useState({
    bp: "",
    pulse: "",
    temperature: "",
    spo2: "",
    weight: "",
    height: "",
    note: "",
  });
  const [vitalSaving, setVitalSaving] = useState(false);
  const [vitalMsg, setVitalMsg] = useState("");
  const [vitalErr, setVitalErr] = useState("");

  const saveVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    setVitalErr("");
    setVitalMsg("");
    const has =
      vitalForm.bp.trim() ||
      vitalForm.pulse.trim() ||
      vitalForm.temperature.trim() ||
      vitalForm.spo2.trim() ||
      vitalForm.weight.trim() ||
      vitalForm.height.trim();
    if (!has) {
      setVitalErr("Enter at least one vital sign.");
      return;
    }
    setVitalSaving(true);
    try {
      const res = await apiCreateEncounter({
        patientId,
        chiefComplaint: "Vitals entry",
        clinicalNotes: vitalForm.note.trim() || "Vitals captured from clinical chart",
        bp: vitalForm.bp.trim(),
        pulse: vitalForm.pulse.trim(),
        temperature: vitalForm.temperature.trim(),
        spo2: vitalForm.spo2.trim(),
        weight: vitalForm.weight.trim(),
        height: vitalForm.height.trim(),
      });
      if (!res.success) {
        setVitalErr(res.error || "Could not save vitals");
        return;
      }
      setVitalMsg("Vitals saved to clinical record.");
      setVitalForm({ bp: "", pulse: "", temperature: "", spo2: "", weight: "", height: "", note: "" });
      await onSaved();
    } catch {
      setVitalErr("Network error while saving vitals");
    } finally {
      setVitalSaving(false);
    }
  };

  const rows = encounters.filter(
    (e: any) => e.bp || e.pulse || e.temperature || e.spo2 || e.weight
  );

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Record vitals</h3>
        </div>
        <form onSubmit={saveVitals} className="space-y-2.5 p-3">
          {vitalErr && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{vitalErr}</div>}
          {vitalMsg && <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{vitalMsg}</div>}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["bp", "B/P (mmHg)"],
                ["pulse", "Pulse (/min)"],
                ["temperature", "Temp"],
                ["spo2", "SpO₂ (%)"],
                ["weight", "Weight"],
                ["height", "Height"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-[11px] font-medium text-gray-600">
                {label}
                <input
                  value={vitalForm[key]}
                  onChange={(e) => setVitalForm({ ...vitalForm, [key]: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
                />
              </label>
            ))}
          </div>
          <label className="block text-[11px] font-medium text-gray-600">
            Note (optional)
            <input
              value={vitalForm.note}
              onChange={(e) => setVitalForm({ ...vitalForm, note: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
              placeholder="Context / nursing note"
            />
          </label>
          <button
            type="submit"
            disabled={vitalSaving}
            className="h-10 w-full rounded-lg bg-[#c2183a] text-sm font-medium text-white disabled:opacity-60"
          >
            {vitalSaving ? "Saving…" : "Save vitals"}
          </button>
          <p className="text-[11px] text-gray-400">
            Saved as a clinical encounter (same model as consult vitals). Author is the signed-in staff.
          </p>
        </form>
      </section>
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Vitals history (IST)</h3>
        </div>
        <div className="p-3">
          {rows.length === 0 ? (
            <p className="py-2 text-xs text-gray-400">No vitals recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-2">When</th>
                    <th className="py-2 pr-2">B/P</th>
                    <th className="py-2 pr-2">Pulse</th>
                    <th className="py-2 pr-2">Temp</th>
                    <th className="py-2 pr-2">SpO₂</th>
                    <th className="py-2 pr-2">Wt</th>
                    <th className="py-2">Ht</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e: any) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">{formatIst(e.createdAt)}</td>
                      <td className="py-2 pr-2">{e.bp || "—"}</td>
                      <td className="py-2 pr-2">{e.pulse || "—"}</td>
                      <td className="py-2 pr-2">{e.temperature || "—"}</td>
                      <td className="py-2 pr-2">{e.spo2 || "—"}</td>
                      <td className="py-2 pr-2">{e.weight || "—"}</td>
                      <td className="py-2">{e.height || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
