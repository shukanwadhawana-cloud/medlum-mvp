"use client";

import { useMemo, useState } from "react";
import { apiCreateEncounter } from "@/lib/api";
import { formatIst } from "@/lib/time";

const INTAKE_TYPES = ["Oral", "IV fluids", "Blood products", "Enteral feed", "Other intake"];
const OUTPUT_TYPES = ["Urine", "Stool", "Vomitus", "Drain", "Other output"];

type IoRow = {
  id: string;
  kind: "intake" | "output";
  category: string;
  volumeMl: string;
  notes: string;
  at: string;
};

function parseIoFromEncounters(encounters: any[]): IoRow[] {
  const rows: IoRow[] = [];
  for (const e of encounters) {
    const notes = String(e.clinicalNotes || "");
    const m = notes.match(/__MEDLUM_IO__:(\{[^}\n]*\})/);
    if (!m) continue;
    try {
      const j = JSON.parse(m[1]) as { kind?: string; category?: string; volumeMl?: string; notes?: string };
      if (j.kind !== "intake" && j.kind !== "output") continue;
      rows.push({
        id: e.id,
        kind: j.kind,
        category: j.category || "",
        volumeMl: j.volumeMl || "",
        notes: j.notes || "",
        at: e.createdAt,
      });
    } catch {
      /* ignore */
    }
  }
  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function ClinicalIOPanel({
  patientId,
  encounters,
  onSaved,
}: {
  patientId: string;
  encounters: any[];
  onSaved: () => Promise<void> | void;
}) {
  const [kind, setKind] = useState<"intake" | "output">("intake");
  const [category, setCategory] = useState(INTAKE_TYPES[0]);
  const [volumeMl, setVolumeMl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const rows = useMemo(() => parseIoFromEncounters(encounters), [encounters]);
  const intakeTotal = rows
    .filter((r) => r.kind === "intake")
    .reduce((s, r) => s + (Number(r.volumeMl) || 0), 0);
  const outputTotal = rows
    .filter((r) => r.kind === "output")
    .reduce((s, r) => s + (Number(r.volumeMl) || 0), 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!volumeMl.trim() && !notes.trim()) {
      setErr("Enter volume (mL) or notes.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        kind,
        category,
        volumeMl: volumeMl.trim(),
        notes: notes.trim(),
      };
      const res = await apiCreateEncounter({
        patientId,
        chiefComplaint: `I/O · ${kind} · ${category}`,
        clinicalNotes: `__MEDLUM_IO__:${JSON.stringify(payload)}\n${notes.trim()}`,
      });
      if (!res.success) {
        setErr(res.error || "Could not save I/O entry");
        return;
      }
      setMsg(`${kind === "intake" ? "Intake" : "Output"} recorded.`);
      setVolumeMl("");
      setNotes("");
      await onSaved();
    } catch {
      setErr("Network error while saving I/O");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Record intake / output
          </h3>
        </div>
        <form onSubmit={save} className="space-y-2 p-3">
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
          {msg && <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{msg}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setKind("intake");
                setCategory(INTAKE_TYPES[0]);
              }}
              className={`h-9 flex-1 rounded-lg text-xs font-medium ${
                kind === "intake" ? "bg-[#140a1f] text-white" : "border"
              }`}
            >
              Intake
            </button>
            <button
              type="button"
              onClick={() => {
                setKind("output");
                setCategory(OUTPUT_TYPES[0]);
              }}
              className={`h-9 flex-1 rounded-lg text-xs font-medium ${
                kind === "output" ? "bg-[#140a1f] text-white" : "border"
              }`}
            >
              Output
            </button>
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 w-full rounded-lg border px-2 text-sm"
          >
            {(kind === "intake" ? INTAKE_TYPES : OUTPUT_TYPES).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            value={volumeMl}
            onChange={(e) => setVolumeMl(e.target.value)}
            placeholder="Volume (mL)"
            inputMode="decimal"
            className="h-10 w-full rounded-lg border px-2 text-sm"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="min-h-[3rem] w-full rounded-lg border px-2 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-lg bg-[#c2183a] text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save I/O entry"}
          </button>
          <p className="text-[11px] text-gray-400">
            Stored as a clinical encounter marker. Totals are session-history based (not a formal fluid balance chart).
          </p>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            I/O history (IST)
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Intake Σ {intakeTotal || 0} mL · Output Σ {outputTotal || 0} mL · Net {intakeTotal - outputTotal} mL
          </p>
        </div>
        <div className="max-h-[28rem] space-y-2 overflow-auto p-3">
          {rows.length === 0 ? (
            <p className="text-xs text-gray-400">No intake/output entries yet.</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex justify-between gap-2 border-b pb-2 text-xs last:border-0">
                <div>
                  <p className="font-medium">
                    {r.kind === "intake" ? "In" : "Out"} · {r.category}
                    {r.volumeMl ? ` · ${r.volumeMl} mL` : ""}
                  </p>
                  {r.notes && <p className="text-gray-600 mt-0.5">{r.notes}</p>}
                </div>
                <span className="shrink-0 text-gray-400">{formatIst(r.at)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
