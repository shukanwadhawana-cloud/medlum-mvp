"use client";

import { useEffect, useMemo, useState } from "react";

type Props = { patient: any };

const routes = ["Oral", "IV", "IM", "SC", "SL", "Topical", "Inhaled", "Other"];
const units = ["mg", "g", "mcg", "mL", "units", "tablet", "capsule", "puff", "Other"];

function medicationLines(medicines: string) {
  return String(medicines || "").split(/[\n;]+/).map((x) => x.trim()).filter(Boolean);
}

export default function MedicationAdministrationPanel({ patient }: Props) {
  const [data, setData] = useState<{ prescriptions: any[]; administrations: any[] }>({ prescriptions: [], administrations: [] });
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState("");
  const [medicationText, setMedicationText] = useState("");
  const [medicationName, setMedicationName] = useState("");
  const [dose, setDose] = useState("");
  const [doseUnit, setDoseUnit] = useState("mg");
  const [route, setRoute] = useState("Oral");
  const [scheduledAt, setScheduledAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/ipd/medications?patientId=" + encodeURIComponent(patient.id), { credentials: "include", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Could not load medication administration record");
    setData({ prescriptions: body.prescriptions || [], administrations: body.administrations || [] });
  }

  useEffect(() => {
    if (!patient?.id) return;
    setSelectedPrescriptionId("");
    setMedicationText("");
    setMedicationName("");
    setMessage("");
    setError("");
    void load().catch((e) => setError(e.message));
  }, [patient?.id]);

  const selectedPrescription = useMemo(() => data.prescriptions.find((p) => p.id === selectedPrescriptionId), [data.prescriptions, selectedPrescriptionId]);
  const medicationOptions = useMemo(() => medicationLines(selectedPrescription?.medicines || ""), [selectedPrescription]);

  function selectMedication(value: string) {
    setMedicationText(value);
    setMedicationName(value.split(/\s+/).slice(0, 3).join(" "));
  }

  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPrescriptionId || !medicationText || !medicationName || !dose || !route || !scheduledAt) {
      setError("Select the medication order and complete medication, dose, route and scheduled time.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/ipd/medications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          prescriptionId: selectedPrescriptionId,
          medicationText,
          medicationName,
          dose,
          doseUnit,
          route,
          scheduledAt: new Date(scheduledAt).toISOString(),
          notes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || "Could not schedule dose");
      setMessage("Dose scheduled. Pharmacy dispensing does not mark it administered.");
      setDose(""); setNotes("");
      await load();
    } catch (e: any) { setError(e.message || "Could not schedule dose"); }
    finally { setBusy(false); }
  }

  async function updateStatus(id: string, status: string) {
    if (status === "ADMINISTERED" && !window.confirm("Confirm that you personally administered this medication dose?")) return;
    if (status !== "ADMINISTERED" && !window.confirm("Record this dose as " + status.toLowerCase() + "?")) return;
    let nextReason = "";
    if (["HELD", "OMITTED", "REFUSED", "CANCELLED"].includes(status)) {
      nextReason = window.prompt("Reason required for " + status.toLowerCase() + ":")?.trim() || "";
      if (!nextReason) return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/ipd/medications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, reason: nextReason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || "Could not update dose");
      setMessage("Medication administration status recorded: " + status);
      await load();
    } catch (e: any) { setError(e.message || "Could not update dose"); }
    finally { setBusy(false); }
  }

  return (
    <div className="border rounded-xl p-3 md:col-span-2">
      <div className="mb-3">
        <h4 className="font-semibold text-xs">Medication Administration Record</h4>
        <p className="text-[10px] text-gray-500">Order → pharmacy dispensing → explicit bedside administration. Dispensed never means administered.</p>
      </div>
      {(error || message) && <div className={error ? "mb-3 rounded-lg bg-red-50 px-2 py-2 text-[10px] text-red-700" : "mb-3 rounded-lg bg-green-50 px-2 py-2 text-[10px] text-green-700"}>{error || message}</div>}
      <form onSubmit={schedule} className="grid gap-2 md:grid-cols-6">
        <select required value={selectedPrescriptionId} onChange={(e) => { setSelectedPrescriptionId(e.target.value); setMedicationText(""); setMedicationName(""); }} className="h-9 rounded-lg border px-2 text-xs md:col-span-2">
          <option value="">Select medication order</option>
          {data.prescriptions.map((p) => <option key={p.id} value={p.id}>{p.id.slice(0, 8)} · {p.pharmacyStatus}</option>)}
        </select>
        <select required value={medicationText} onChange={(e) => selectMedication(e.target.value)} className="h-9 rounded-lg border px-2 text-xs md:col-span-2">
          <option value="">Select ordered medication</option>
          {medicationOptions.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input required value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose" className="h-9 rounded-lg border px-2 text-xs" />
        <select value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} className="h-9 rounded-lg border px-2 text-xs">{units.map((x) => <option key={x}>{x}</option>)}</select>
        <input required value={medicationName} onChange={(e) => setMedicationName(e.target.value)} placeholder="Medication identity" className="h-9 rounded-lg border px-2 text-xs md:col-span-2" />
        <select required value={route} onChange={(e) => setRoute(e.target.value)} className="h-9 rounded-lg border px-2 text-xs">{routes.map((x) => <option key={x}>{x}</option>)}</select>
        <input required type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-9 rounded-lg border px-2 text-xs md:col-span-2" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical note (optional)" className="h-9 rounded-lg border px-2 text-xs md:col-span-3" />
        <div className="flex gap-2 md:col-span-3"><button type="button" onClick={() => { setSelectedPrescriptionId(""); setMedicationText(""); setMedicationName(""); setDose(""); setNotes(""); }} className="h-9 rounded-lg border px-3 text-xs">Cancel</button><button disabled={busy} className="h-9 rounded-lg bg-[#140a1f] px-3 text-xs text-white disabled:opacity-50">{busy ? "Saving…" : "Schedule dose"}</button></div>
      </form>
      <div className="mt-4 space-y-2">
        {data.administrations.length === 0 ? <p className="text-[10px] text-gray-500">No medication-administration events recorded for this IPD patient.</p> : data.administrations.map((a) => (
          <div key={a.id} className="rounded-lg border p-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold">{a.medicationName} · {a.dose} {a.doseUnit} · {a.route}</p>
                <p className="text-[10px] text-gray-500">{a.status} · Scheduled {new Date(a.scheduledAt).toLocaleString()} {a.actualAt ? "· Actual " + new Date(a.actualAt).toLocaleString() : ""}</p>
                <p className="text-[10px] text-gray-500">Order {a.prescriptionId} · {a.actor} · {a.role}{a.staffCode ? " · " + a.staffCode : ""}</p>
                {a.reason && <p className="text-[10px] text-amber-700">Reason: {a.reason}</p>}
              </div>
              {a.status === "SCHEDULED" && <div className="flex flex-wrap gap-1">
                <button disabled={busy} onClick={() => updateStatus(a.id, "ADMINISTERED")} className="rounded-lg bg-[#c2183a] px-2 py-1.5 text-[10px] font-semibold text-white">Administered</button>
                <button disabled={busy} onClick={() => updateStatus(a.id, "HELD")} className="rounded-lg border px-2 py-1.5 text-[10px]">Held</button>
                <button disabled={busy} onClick={() => updateStatus(a.id, "OMITTED")} className="rounded-lg border px-2 py-1.5 text-[10px]">Omitted</button>
                <button disabled={busy} onClick={() => updateStatus(a.id, "REFUSED")} className="rounded-lg border px-2 py-1.5 text-[10px]">Refused</button>
                <button disabled={busy} onClick={() => updateStatus(a.id, "CANCELLED")} className="rounded-lg border px-2 py-1.5 text-[10px]">Cancel dose</button>
              </div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
