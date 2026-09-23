"use client";

import { useMemo, useState } from "react";
import { apiCreateEncounter } from "@/lib/api";
import { formatIst } from "@/lib/time";

export function ClinicalProblemsPanel({
  patientId,
  encounters,
  profile,
  onSaved,
}: {
  patientId: string;
  encounters: any[];
  profile: Record<string, string>;
  onSaved: () => Promise<void> | void;
}) {
  const [problem, setProblem] = useState("");
  const [status, setStatus] = useState("Active");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const problems = useMemo(() => {
    const rows: { text: string; when?: string; source: string }[] = [];
    if (profile.workingDiagnosis) {
      rows.push({ text: profile.workingDiagnosis, source: "Admission working Dx" });
    }
    if (profile.diagnosis && profile.diagnosis !== profile.workingDiagnosis) {
      rows.push({ text: profile.diagnosis, source: "Profile diagnosis" });
    }
    for (const e of encounters) {
      if (e.diagnosis) {
        rows.push({
          text: String(e.diagnosis),
          when: e.createdAt,
          source: e.chiefComplaint || "Encounter",
        });
      }
    }
    const seen = new Set<string>();
    return rows.filter((r) => {
      const k = r.text.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [encounters, profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!problem.trim()) {
      setErr("Enter a problem / diagnosis.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiCreateEncounter({
        patientId,
        chiefComplaint: `Problem · ${status}`,
        diagnosis: problem.trim(),
        clinicalNotes: notes.trim() || `Problem status: ${status}`,
        assessment: notes.trim(),
      });
      if (!res.success) {
        setErr(res.error || "Could not save problem");
        return;
      }
      setMsg("Problem recorded.");
      setProblem("");
      setNotes("");
      await onSaved();
    } catch {
      setErr("Network error while saving problem");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Active / recorded problems
          </h3>
        </div>
        <div className="p-3">
          {problems.length === 0 ? (
            <p className="text-xs text-gray-400">No active problem found.</p>
          ) : (
            <ul className="divide-y text-xs">
              {problems.map((p, i) => (
                <li key={i} className="flex justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium text-sm">{p.text}</p>
                    <p className="text-gray-500">{p.source}</p>
                  </div>
                  {p.when && (
                    <span className="shrink-0 text-gray-400">{formatIst(p.when)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Add problem / diagnosis
          </h3>
        </div>
        <form onSubmit={save} className="space-y-2 p-3">
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
          {msg && <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{msg}</div>}
          <input
            required
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="Problem / diagnosis"
            className="h-10 w-full rounded-lg border px-2 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 w-full rounded-lg border px-2 text-sm"
          >
            <option>Active</option>
            <option>Resolved</option>
            <option>Chronic</option>
            <option>Ruled out</option>
          </select>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Clinical context (optional)"
            className="min-h-[4rem] w-full rounded-lg border px-2 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-lg bg-[#140a1f] text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Record problem"}
          </button>
        </form>
      </section>
    </div>
  );
}
