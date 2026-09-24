"use client";

import { useMemo, useState } from "react";
import { apiCreateEncounter } from "@/lib/api";
import { formatIst } from "@/lib/time";

const SPECIALTIES = [
  "General Medicine",
  "GASTROENTEROLOGY",
  "G.I. SURGERY",
  "CRITICAL CARE MEDICINE",
  "CARDIOLOGY",
  "CTVS",
  "NEUROLOGY",
  "NEUROSURGERY",
  "ORTHOPAEDICS",
  "OBSTETRICS & GYNAECOLOGY",
  "PAEDIATRICS",
  "ENT",
  "OPHTHALMOLOGY",
  "DERMATOLOGY",
  "ENDOCRINOLOGY",
  "NEPHROLOGY",
  "UROLOGY",
  "PULMONOLOGY",
  "EMERGENCY",
  "ONCOLOGY",
  "RADIOLOGY",
  "PATHOLOGY",
  "PHYSIOTHERAPY",
  "OTHER",
];

const PRIORITIES = ["Routine", "Urgent", "Emergency"];

type FormState = {
  fromSpecialty: string;
  toSpecialty: string;
  toConsultant: string;
  priority: string;
  reason: string;
  clinicalSummary: string;
  investigations: string;
  requestedAction: string;
};

const blank: FormState = {
  fromSpecialty: "General Medicine",
  toSpecialty: "GASTROENTEROLOGY",
  toConsultant: "",
  priority: "Routine",
  reason: "",
  clinicalSummary: "",
  investigations: "",
  requestedAction: "Opinion and further management",
};

export function ClinicalReferralPanel({
  patientId,
  encounters,
  labs,
  diagnostics,
  profile,
  onSaved,
}: {
  patientId: string;
  encounters: any[];
  labs: any[];
  diagnostics: any[];
  profile: Record<string, string>;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<FormState>({
    ...blank,
    fromSpecialty: profile.consultantSpecialty || "General Medicine",
    toConsultant: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const prior = useMemo(() => {
    return [...encounters]
      .filter((e) => {
        const t = `${e.chiefComplaint || ""} ${e.clinicalNotes || ""}`.toLowerCase();
        return t.includes("referral") || t.includes("consult");
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [encounters]);

  const pullClinical = () => {
    const latest = encounters[0];
    const dx = profile.workingDiagnosis || profile.diagnosis || latest?.diagnosis || "";
    const cc = profile.chiefComplaint || latest?.chiefComplaint || "";
    const notes = latest?.clinicalNotes || latest?.assessment || "";
    set(
      "clinicalSummary",
      [cc && `CC: ${cc}`, dx && `Dx: ${dx}`, notes].filter(Boolean).join("\n")
    );
    set("reason", form.reason || cc || dx || form.reason);
  };

  const pullInvestigations = () => {
    const labLines = labs.slice(0, 10).map((l) => `Lab: ${l.testName} — ${l.result || l.status || "—"}`);
    const dxLines = diagnostics
      .slice(0, 8)
      .map((d) => `Imaging: ${d.studyName}${d.modality ? ` (${d.modality})` : ""} — ${d.status || "—"}`);
    set("investigations", [...labLines, ...dxLines].join("\n") || form.investigations);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!form.reason.trim() && !form.clinicalSummary.trim()) {
      setErr("Enter reason for referral or clinical summary.");
      return;
    }
    setSaving(true);
    try {
      const body = [
        `Note type: Referral / Consult`,
        `From: ${form.fromSpecialty}`,
        `To specialty: ${form.toSpecialty}`,
        form.toConsultant ? `To consultant: ${form.toConsultant}` : "",
        `Priority: ${form.priority}`,
        form.reason ? `Reason: ${form.reason}` : "",
        form.clinicalSummary ? `Clinical summary:\n${form.clinicalSummary}` : "",
        form.investigations ? `Investigations:\n${form.investigations}` : "",
        form.requestedAction ? `Requested action: ${form.requestedAction}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const res = await apiCreateEncounter({
        patientId,
        chiefComplaint: `Referral · ${form.toSpecialty} · ${form.priority}`,
        clinicalNotes: body,
        diagnosis: profile.workingDiagnosis || profile.diagnosis || "",
        plan: form.requestedAction,
        assessment: form.reason,
      });
      if (!res.success) {
        setErr(res.error || "Could not save referral");
        return;
      }
      setMsg("Referral / consult note saved.");
      setForm((f) => ({
        ...f,
        reason: "",
        clinicalSummary: "",
        investigations: "",
        requestedAction: "Opinion and further management",
      }));
      await onSaved();
    } catch {
      setErr("Network error while saving referral");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Create referral / consult
          </h3>
        </div>
        <form onSubmit={save} className="space-y-2.5 p-3">
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
          {msg && <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{msg}</div>}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-[11px] font-medium text-gray-600">
              From specialty
              <select
                value={form.fromSpecialty}
                onChange={(e) => set("fromSpecialty", e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
              >
                {SPECIALTIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] font-medium text-gray-600">
              To specialty
              <select
                value={form.toSpecialty}
                onChange={(e) => set("toSpecialty", e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
              >
                {SPECIALTIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-[11px] font-medium text-gray-600">
            To consultant (optional)
            <input
              value={form.toConsultant}
              onChange={(e) => set("toConsultant", e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
              placeholder="Named consultant / team"
            />
          </label>

          <label className="block text-[11px] font-medium text-gray-600">
            Priority
            <select
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
            >
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={pullClinical}
              className="h-8 rounded-lg border bg-white px-2 text-[11px] font-medium"
            >
              Pull clinical summary
            </button>
            <button
              type="button"
              onClick={pullInvestigations}
              className="h-8 rounded-lg border bg-white px-2 text-[11px] font-medium"
            >
              Pull labs / imaging
            </button>
          </div>

          <label className="block text-[11px] font-medium text-gray-600">
            Reason for referral
            <textarea
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              className="mt-1 min-h-[3rem] w-full rounded-lg border px-2 py-2 text-sm"
              placeholder="Why is this referral required?"
            />
          </label>

          <label className="block text-[11px] font-medium text-gray-600">
            Clinical summary
            <textarea
              value={form.clinicalSummary}
              onChange={(e) => set("clinicalSummary", e.target.value)}
              className="mt-1 min-h-[5rem] w-full rounded-lg border px-2 py-2 text-sm"
            />
          </label>

          <label className="block text-[11px] font-medium text-gray-600">
            Investigations done / pending
            <textarea
              value={form.investigations}
              onChange={(e) => set("investigations", e.target.value)}
              className="mt-1 min-h-[3.5rem] w-full rounded-lg border px-2 py-2 text-sm"
            />
          </label>

          <label className="block text-[11px] font-medium text-gray-600">
            Requested action
            <input
              value={form.requestedAction}
              onChange={(e) => set("requestedAction", e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
              placeholder="Opinion / take over / procedure…"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-lg bg-[#c2183a] text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save referral"}
          </button>
          <p className="text-[11px] text-gray-400">
            Stored as a clinical encounter. Author is the signed-in clinician (server session).
          </p>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Referral / consult history
          </h3>
        </div>
        <div className="max-h-[32rem] space-y-2 overflow-auto p-3">
          {prior.length === 0 ? (
            <p className="text-xs text-gray-400">No referrals recorded yet.</p>
          ) : (
            prior.map((e: any) => (
              <article key={e.id} className="rounded-lg border p-3 text-xs">
                <div className="mb-1 flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-sm">{e.chiefComplaint || "Referral"}</span>
                  <span className="text-gray-500">{formatIst(e.createdAt)}</span>
                </div>
                {e.clinicalNotes && (
                  <p className="whitespace-pre-wrap text-gray-700">{e.clinicalNotes}</p>
                )}
                {e.plan && (
                  <p className="mt-1">
                    <b>Plan:</b> {e.plan}
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
