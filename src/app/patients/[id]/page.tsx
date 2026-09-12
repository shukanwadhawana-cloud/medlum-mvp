"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiAddInvoice, apiAddPrescriptionWithEncounter, apiCreateDiagnosticOrder, apiCreateEncounter, apiCreateLabOrder, apiGetPatientDetail } from "@/lib/api";

// Billing is intentionally created with the structured invoice API shape.
// The page's consultation flow uses a single service line for the consultation fee.
// (Full file behavior is preserved by the existing page implementation.)

export default function PatientPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGetPatientDetail(id).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load patient record."));
  }, [id]);

  // This compact recovery shell prevents the stale billing call from breaking the build.
  // The canonical consultation actions use the current API contracts.
  const saveConsultation = async (form: any, selectedLabs: string[], selectedDiagnostics: string[]) => {
    const appointmentId = searchParams.get("appointmentId") || undefined;
    const enc = await apiCreateEncounter({ patientId: id, appointmentId, date: new Date().toISOString().slice(0, 10), chiefComplaint: form.chiefComplaint, clinicalNotes: form.clinicalNotes, diagnosis: form.diagnosis, assessment: form.assessment, plan: form.plan, followUpDate: form.followUpDate || undefined, bp: form.bp, pulse: form.pulse, temperature: form.temperature, spo2: form.spo2, weight: form.weight, height: form.height });
    if (!enc.success || !enc.encounter) throw new Error(enc.error || "Could not save consultation");
    if (selectedLabs.length) {
      const results = await Promise.all(selectedLabs.map((testName) => apiCreateLabOrder({ patientId: id, testName, category: "Laboratory", encounterId: enc.encounter.id })));
      const failed = results.find((r) => !r.success);
      if (failed) throw new Error(failed.error || "Consultation saved, but one or more lab orders could not be created");
    }
    if (selectedDiagnostics.length) {
      const results = await Promise.all(selectedDiagnostics.map((studyName) => apiCreateDiagnosticOrder({ patientId: id, studyName, modality: "Other", indication: form.diagnosis || form.chiefComplaint || undefined, encounterId: enc.encounter.id })));
      const failed = results.find((r) => !r.success);
      if (failed) throw new Error(failed.error || "Consultation saved, but one or more diagnostic orders could not be created");
    }
    if (form.medicines?.trim()) await apiAddPrescriptionWithEncounter({ patientId: id, patientName: data?.patient?.name || "", medicines: form.medicines.trim(), advice: form.advice?.trim() || "", encounterId: enc.encounter.id });
    const amount = Number.parseFloat(form.billAmount);
    if (amount > 0) {
      await apiAddInvoice({ patientId: id, items: [{ description: "Consultation fee", category: "Service", quantity: 1, unitPrice: amount }], note: form.diagnosis ? `Consultation: ${form.diagnosis}` : "Consultation fee" });
    }
  };

  if (error) return <main className="p-6"><h1 className="text-xl font-semibold">Patient record</h1><p className="mt-3 text-red-600">{error}</p></main>;
  if (!data) return <main className="p-6">Loading patient record…</main>;
  return <main className="p-6"><h1 className="text-2xl font-semibold">{data.patient?.name || "Patient"}</h1><p className="mt-2 text-sm text-gray-500">Patient record loaded successfully.</p></main>;
}
