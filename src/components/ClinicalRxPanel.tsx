"use client";

import { useState } from "react";
import Link from "next/link";
import { apiAddPrescription } from "@/lib/api";
import { formatIst } from "@/lib/time";

export function ClinicalRxPanel({
  patientId,
  prescriptions,
  onSaved,
}: {
  patientId: string;
  prescriptions: any[];
  onSaved: () => Promise<void> | void;
}) {
  const [medicines, setMedicines] = useState("");
  const [advice, setAdvice] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!medicines.trim()) {
      setErr("Enter at least one medicine / regimen.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiAddPrescription({
        patientId,
        medicines: medicines.trim(),
        advice: advice.trim(),
      });
      if (!res.success) {
        setErr(res.error || "Could not save prescription");
        return;
      }
      setMsg("Prescription saved.");
      setMedicines("");
      setAdvice("");
      await onSaved();
    } catch {
      setErr("Network error while saving prescription");
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...prescriptions].sort((a, b) => {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Write prescription
          </h3>
        </div>
        <form onSubmit={save} className="space-y-2.5 p-3">
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
          {msg && <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{msg}</div>}
          <label className="block text-[11px] font-medium text-gray-600">
            Medicines / regimen
            <textarea
              required
              value={medicines}
              onChange={(e) => setMedicines(e.target.value)}
              className="mt-1 min-h-[8rem] w-full rounded-lg border px-2 py-2 text-sm"
              placeholder={"One per line, e.g.\nTab. UDILIV 300 mg — 1-0-1 × 30 days\nTab. MYCOPHENOLATE 500 mg — 1-0-1"}
            />
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Advice / instructions
            <textarea
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
              className="mt-1 min-h-[3rem] w-full rounded-lg border px-2 py-2 text-sm"
              placeholder="Diet, activity, follow-up…"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-lg bg-[#c2183a] text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save prescription"}
          </button>
          <p className="text-[11px] text-gray-400">
            Author is the signed-in clinician (server session). Scheduled MAR / dose administration is not part of this view.
          </p>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Prescription history
          </h3>
          <Link href="/prescriptions" className="text-[11px] font-medium text-[#c2183a]">
            All Rx
          </Link>
        </div>
        <div className="max-h-[28rem] space-y-2 overflow-auto p-3">
          {sorted.length === 0 ? (
            <p className="text-xs text-gray-400">No prescriptions on file.</p>
          ) : (
            sorted.map((r: any) => (
              <article key={r.id} className="rounded-lg border p-3 text-xs">
                <div className="mb-1 flex justify-between gap-2">
                  <span className="font-semibold">Prescription</span>
                  <span className="text-gray-500">{formatIst(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{r.medicines}</p>
                {r.advice && (
                  <p className="mt-1 whitespace-pre-wrap text-gray-600">
                    <b>Advice:</b> {r.advice}
                  </p>
                )}
                <Link
                  href={`/prescriptions/print?id=${encodeURIComponent(r.id)}`}
                  className="mt-2 inline-block font-medium text-[#c2183a]"
                >
                  Print clinical Rx
                </Link>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
