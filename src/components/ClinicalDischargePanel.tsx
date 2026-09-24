"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  "HPB SURGERY AND LIVER TRANSPLANT",
  "OTHER",
];

const SUMMARY_TYPES = [
  "Discharge Summary",
  "Transfer Summary",
  "Death Summary",
  "Case Summary",
  "DAMA Summary",
  "LAMA Summary",
];

type FormState = {
  specialty: string;
  title: string;
  dischargeAt: string;
  diagnosis: string;
  presentingComplaints: string;
  hpi: string;
  pastMedicalHistory: string;
  currentMedication: string;
  personalHistory: string;
  familyHistory: string;
  allergies: string;
  occupationalHistory: string;
  onExamination: string;
  procedure: string;
  courseInHospital: string;
  conditionOnDischarge: string;
  tpaPatient: "Yes" | "No" | "";
  labResults: string;
  medicationsDuringStay: string;
  medicationsOnDischarge: string;
  advice: string;
  urgentCare: string;
  specialNeeds: string;
  followUpAdvice: string;
};

const blank = (p?: any): FormState => ({
  specialty: "General Medicine",
  title: "Discharge Summary",
  dischargeAt: new Date().toISOString().slice(0, 16),
  diagnosis: "",
  presentingComplaints: "",
  hpi: "",
  pastMedicalHistory: "No Significant Past Medical History",
  currentMedication: "",
  personalHistory: "No Significant Personal History",
  familyHistory: "No Significant Family History",
  allergies: p?.allergies || "No Known Allergies",
  occupationalHistory: "No Significant Occupational History",
  onExamination: "",
  procedure: "",
  courseInHospital: "",
  conditionOnDischarge: "",
  tpaPatient: "",
  labResults: "",
  medicationsDuringStay: "",
  medicationsOnDischarge: "",
  advice: "",
  urgentCare: "",
  specialNeeds: "",
  followUpAdvice: "",
});

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block text-[11px] font-medium text-gray-600">
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 min-h-[3.5rem] w-full rounded-lg border px-2 py-2 text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
        />
      )}
    </label>
  );
}

function makeContent(f: FormState) {
  return `[${f.title}]
Specialty: ${f.specialty}
Date & time of discharge: ${f.dischargeAt}
Diagnosis: ${f.diagnosis}
Presenting complaints: ${f.presentingComplaints}
History of present illness: ${f.hpi}
Past medical history: ${f.pastMedicalHistory}
Current medication: ${f.currentMedication}
Personal history: ${f.personalHistory}
Family history: ${f.familyHistory}
Allergies: ${f.allergies}
Occupational history: ${f.occupationalHistory}
On examination: ${f.onExamination}
Procedure: ${f.procedure}
Course in hospital: ${f.courseInHospital}
Condition on discharge: ${f.conditionOnDischarge}
TPA patient: ${f.tpaPatient || "—"}
Lab results: ${f.labResults}
Medications during stay: ${f.medicationsDuringStay}
Medications on discharge: ${f.medicationsOnDischarge}
Advice: ${f.advice}
When to obtain urgent care: ${f.urgentCare}
Special needs: ${f.specialNeeds}
Follow-up advice: ${f.followUpAdvice}
`;
}

export function ClinicalDischargePanel({
  patientId,
  patient,
  encounters,
  labs,
  prescriptions,
  profile,
  careSetting,
  onSaved,
}: {
  patientId: string;
  patient: any;
  encounters: any[];
  labs: any[];
  prescriptions: any[];
  profile: Record<string, string>;
  careSetting: "OPD" | "IPD";
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<FormState>(() => blank(patient));
  const [saving, setSaving] = useState(false);
  const [discharging, setDischarging] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(true);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const prior = useMemo(() => {
    const keys = ["discharge", "transfer summary", "death summary", "dama", "lama", "case summary"];
    return [...encounters]
      .filter((e) => {
        const t = `${e.chiefComplaint || ""} ${e.clinicalNotes || ""}`.toLowerCase();
        return keys.some((k) => t.includes(k));
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [encounters]);

  const pullNotes = (section: string) => {
    if (section === "allergies") set("allergies", patient?.allergies || "No Known Allergies");
    if (section === "diagnosis")
      set("diagnosis", profile.workingDiagnosis || profile.diagnosis || encounters[0]?.diagnosis || "");
    if (section === "complaints")
      set("presentingComplaints", profile.chiefComplaint || encounters[0]?.chiefComplaint || "");
    if (section === "hpi") {
      const note = encounters.find((e) => e.clinicalNotes || e.assessment);
      set("hpi", note?.clinicalNotes || note?.assessment || profile.hpi || "");
    }
    if (section === "vitals") {
      const v = encounters.find((e) => e.bp || e.pulse || e.spo2 || e.temperature);
      if (v) {
        set(
          "onExamination",
          [
            v.bp && `BP ${v.bp}`,
            v.pulse && `Pulse ${v.pulse}`,
            v.temperature && `Temp ${v.temperature}`,
            v.spo2 && `SpO₂ ${v.spo2}`,
            v.weight && `Wt ${v.weight}`,
          ]
            .filter(Boolean)
            .join(" · ")
        );
      }
    }
    if (section === "labs") {
      const lines = labs
        .slice(0, 12)
        .map((l) => `${l.testName}: ${l.result || l.status || "—"}`)
        .join("\n");
      set("labResults", lines || form.labResults);
    }
    if (section === "meds") {
      const lines = prescriptions
        .slice(0, 8)
        .map((r) => r.medicines)
        .filter(Boolean)
        .join("\n---\n");
      set("medicationsDuringStay", lines);
      set("medicationsOnDischarge", lines);
      set("currentMedication", lines);
    }
    if (section === "notes") {
      const lines = encounters
        .slice(0, 6)
        .map(
          (e) =>
            `[${formatIst(e.createdAt)}] ${e.chiefComplaint || "Note"}\n${e.clinicalNotes || e.assessment || ""}`
        )
        .join("\n\n");
      set("courseInHospital", lines || form.courseInHospital);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!form.diagnosis.trim() && !form.presentingComplaints.trim() && !form.courseInHospital.trim()) {
      setErr("Enter at least diagnosis, presenting complaints, or course in hospital.");
      return;
    }
    setSaving(true);
    try {
      const content = makeContent(form);
      const res = await fetch("/api/ipd", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clinical-note",
          patientId,
          noteType: form.title || "Discharge Summary",
          content,
          authorRole: form.specialty,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        setErr(body.error || "Could not save discharge summary");
        return;
      }
      setMsg(`${form.title} saved.`);
      await onSaved();
    } catch {
      setErr("Network error while saving discharge summary");
    } finally {
      setSaving(false);
    }
  };

  const dischargePatient = async () => {
    if (careSetting !== "IPD") {
      setErr("Patient discharge action is for IPD census patients.");
      return;
    }
    if (!window.confirm("Mark this patient as discharged from IPD?")) return;
    setDischarging(true);
    setErr("");
    try {
      const res = await fetch("/api/patients/lifecycle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          action: "discharge",
          reason: "Discharge Summary completed",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        setErr(body.error || "Could not discharge patient");
        return;
      }
      setMsg("Patient discharged from IPD.");
      await onSaved();
    } catch {
      setErr("Network error while discharging patient");
    } finally {
      setDischarging(false);
    }
  };

  return (
    <div className="space-y-3">
      {(err || msg) && (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            err ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}
        >
          {err || msg}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Create discharge summary
          </h3>
          <div className="flex gap-2">
            <Link href="/ipd-summaries" className="text-[11px] font-medium text-[#c2183a]">
              Full IPD summaries desk
            </Link>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="text-[11px] font-medium text-gray-600"
            >
              {showForm ? "Hide form" : "Show form"}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={save} className="space-y-3 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-[11px] font-medium text-gray-600">
                Specialty
                <select
                  value={form.specialty}
                  onChange={(e) => {
                    const sp = e.target.value;
                    setForm((f) => ({
                      ...f,
                      specialty: sp,
                      title: f.title.startsWith("Discharge")
                        ? `Discharge Summary ${sp}`
                        : f.title,
                    }));
                  }}
                  className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
                >
                  {SPECIALTIES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] font-medium text-gray-600">
                Discharge summary title
                <select
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
                >
                  {SUMMARY_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                  <option>{`Discharge Summary ${form.specialty}`}</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5 rounded-lg border bg-[#faf9fb] p-2">
              <span className="w-full text-[10px] font-semibold uppercase text-gray-500">
                Notes pull (from chart data)
              </span>
              {[
                ["allergies", "Allergies"],
                ["diagnosis", "Diagnosis"],
                ["complaints", "Complaints"],
                ["hpi", "HPI / notes"],
                ["vitals", "Vitals"],
                ["labs", "Laboratory"],
                ["meds", "Medications"],
                ["notes", "Course / notes"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pullNotes(k)}
                  className="h-8 rounded-lg border bg-white px-2 text-[11px] font-medium"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <Field
                label="Date and time of discharge"
                value={form.dischargeAt}
                onChange={(v) => set("dischargeAt", v)}
              />
              <Field label="Diagnosis" value={form.diagnosis} onChange={(v) => set("diagnosis", v)} />
              <div className="md:col-span-2">
                <Field
                  label="Presenting complaints"
                  value={form.presentingComplaints}
                  onChange={(v) => set("presentingComplaints", v)}
                  multiline
                />
              </div>
              <div className="md:col-span-2">
                <Field
                  label="History of present illness"
                  value={form.hpi}
                  onChange={(v) => set("hpi", v)}
                  multiline
                />
              </div>
              <Field
                label="Past medical history"
                value={form.pastMedicalHistory}
                onChange={(v) => set("pastMedicalHistory", v)}
                multiline
              />
              <Field
                label="Current medication"
                value={form.currentMedication}
                onChange={(v) => set("currentMedication", v)}
                multiline
              />
              <Field
                label="Personal history"
                value={form.personalHistory}
                onChange={(v) => set("personalHistory", v)}
              />
              <Field
                label="Family history"
                value={form.familyHistory}
                onChange={(v) => set("familyHistory", v)}
              />
              <Field label="Allergies" value={form.allergies} onChange={(v) => set("allergies", v)} />
              <Field
                label="Occupational history"
                value={form.occupationalHistory}
                onChange={(v) => set("occupationalHistory", v)}
              />
              <div className="md:col-span-2">
                <Field
                  label="On examination"
                  value={form.onExamination}
                  onChange={(v) => set("onExamination", v)}
                  multiline
                />
              </div>
              <div className="md:col-span-2">
                <Field
                  label="Procedure"
                  value={form.procedure}
                  onChange={(v) => set("procedure", v)}
                  multiline
                />
              </div>
              <div className="md:col-span-2">
                <Field
                  label="Course in hospital"
                  value={form.courseInHospital}
                  onChange={(v) => set("courseInHospital", v)}
                  multiline
                />
              </div>
              <Field
                label="Condition on discharge"
                value={form.conditionOnDischarge}
                onChange={(v) => set("conditionOnDischarge", v)}
              />
              <label className="block text-[11px] font-medium text-gray-600">
                TPA patient
                <div className="mt-2 flex gap-4 text-sm">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={form.tpaPatient === "Yes"}
                      onChange={() => set("tpaPatient", "Yes")}
                    />
                    Yes
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={form.tpaPatient === "No"}
                      onChange={() => set("tpaPatient", "No")}
                    />
                    No
                  </label>
                </div>
              </label>
              <div className="md:col-span-2">
                <Field
                  label="Lab results"
                  value={form.labResults}
                  onChange={(v) => set("labResults", v)}
                  multiline
                />
              </div>
              <div className="md:col-span-2">
                <Field
                  label="Medications during stay"
                  value={form.medicationsDuringStay}
                  onChange={(v) => set("medicationsDuringStay", v)}
                  multiline
                />
              </div>
              <div className="md:col-span-2">
                <Field
                  label="Medications on discharge"
                  value={form.medicationsOnDischarge}
                  onChange={(v) => set("medicationsOnDischarge", v)}
                  multiline
                />
              </div>
              <div className="md:col-span-2">
                <Field label="Advice" value={form.advice} onChange={(v) => set("advice", v)} multiline />
              </div>
              <Field
                label="When to obtain urgent care"
                value={form.urgentCare}
                onChange={(v) => set("urgentCare", v)}
                multiline
              />
              <Field
                label="Special needs"
                value={form.specialNeeds}
                onChange={(v) => set("specialNeeds", v)}
              />
              <div className="md:col-span-2">
                <Field
                  label="Follow-up advice"
                  value={form.followUpAdvice}
                  onChange={(v) => set("followUpAdvice", v)}
                  multiline
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="h-10 rounded-lg bg-[#c2183a] px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save discharge summary"}
              </button>
              {careSetting === "IPD" && (
                <button
                  type="button"
                  onClick={dischargePatient}
                  disabled={discharging}
                  className="h-10 rounded-lg border border-red-300 px-4 text-sm font-medium text-red-700 disabled:opacity-60"
                >
                  {discharging ? "Discharging…" : "Discharge patient (IPD)"}
                </button>
              )}
              <Link
                href="/ipd/print"
                className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium"
              >
                IPD print
              </Link>
            </div>
            <p className="text-[11px] text-gray-400">
              Saved via IPD clinical documentation (session author). Unsigned drafts are editable by re-saving a new
              version.
            </p>
          </form>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Discharge summaries details
          </h3>
        </div>
        <div className="overflow-x-auto p-3">
          {prior.length === 0 ? (
            <p className="text-xs text-gray-400">No discharge / transfer summaries found yet.</p>
          ) : (
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead className="text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="pb-2 pr-2">Title / complaint</th>
                  <th className="pb-2 pr-2">Date of entry</th>
                  <th className="pb-2">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {prior.map((e: any) => (
                  <tr key={e.id}>
                    <td className="py-2 pr-2 font-medium">{e.chiefComplaint || "Summary"}</td>
                    <td className="py-2 pr-2 text-gray-500">{formatIst(e.createdAt)}</td>
                    <td className="py-2 text-gray-600">
                      <span className="line-clamp-2 whitespace-pre-wrap">
                        {e.clinicalNotes || e.assessment || e.diagnosis || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
